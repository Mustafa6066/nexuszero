import type { Context, Next } from 'hono';
import Redis from 'ioredis';
import { AppError, PLAN_RATE_LIMITS } from '@nexuszero/shared';
import { getDb, tenants } from '@nexuszero/db';
import { eq } from 'drizzle-orm';

let redis: Redis | null = null;
let hasWarnedRedisMissing = false;
let hasWarnedRedisUnavailable = false;

function isProductionLikeEnvironment(): boolean {
  return process.env.NODE_ENV === 'production'
    || Boolean(process.env.RAILWAY_PROJECT_ID)
    || Boolean(process.env.RAILWAY_SERVICE_ID)
    || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME);
}

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_PRIVATE_URL || process.env.REDIS_URL;
    if (!redisUrl && isProductionLikeEnvironment()) {
      return null;
    }

    // enableOfflineQueue:false causes commands to immediately reject (instead of
    // buffering forever) when the connection is unavailable.  This prevents the
    // rate-limit middleware from hanging the entire request pipeline when Redis
    // is not configured or temporarily down.
    redis = new Redis(redisUrl || 'redis://localhost:6379', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    // Suppress unhandled-error events so Node.js doesn't crash on connect failures
    redis.on('error', () => {});
  }
  return redis;
}

// Cache tenant plans for rate limiting — capped at 5 000 entries to bound memory
const MAX_PLAN_CACHE_SIZE = 5_000;
const planCache = new Map<string, { plan: string; expiresAt: number }>();

async function getTenantPlan(tenantId: string): Promise<string> {
  const now = Date.now();
  const cached = planCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.plan;
  }

  const db = getDb();
  const [tenant] = await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const plan = tenant?.plan || 'launchpad';

  if (planCache.size >= MAX_PLAN_CACHE_SIZE) {
    // Evict the oldest entry
    const oldest = planCache.keys().next().value;
    if (oldest) planCache.delete(oldest);
  }
  planCache.set(tenantId, { plan, expiresAt: now + 60_000 });
  return plan;
}

export const rateLimitMiddleware = async (c: Context, next: Next) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) return next();

  let plan: string;
  try {
    plan = await getTenantPlan(tenantId);
  } catch {
    // DB unavailable — skip rate limiting and proceed
    return next();
  }

  const limit = PLAN_RATE_LIMITS[plan as keyof typeof PLAN_RATE_LIMITS] || PLAN_RATE_LIMITS.launchpad;

  try {
    const r = getRedis();
    if (!r) {
      if (!hasWarnedRedisMissing) {
        console.warn('Rate limit Redis is not configured; skipping enforcement');
        hasWarnedRedisMissing = true;
      }
      return next();
    }

    const key = `ratelimit:${tenantId}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - 60;

    const pipe = r.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zadd(key, now, `${now}:${Math.random()}`);
    pipe.zcard(key);
    pipe.expire(key, 120);
    // Race against a 2-second timeout so a slow/disconnected Redis never
    // blocks the request; on timeout we simply skip enforcement.
    const results = await Promise.race([
      pipe.exec(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);

    const count = (results?.[2]?.[1] as number) || 0;

    if (results === null) {
      // Timed out waiting for Redis — skip enforcement
      return next();
    }

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
    c.header('X-RateLimit-Reset', String(now + 60));

    if (count > limit) {
      throw new AppError('RATE_LIMIT_EXCEEDED', { limit, resetAt: now + 60 });
    }
  } catch (err) {
    // Re-throw rate limit errors; for Redis connectivity issues, fail open
    if (err instanceof AppError) throw err;
    if (!hasWarnedRedisUnavailable) {
      console.warn('Rate limit Redis unavailable, skipping enforcement:', err instanceof Error ? err.message : String(err));
      hasWarnedRedisUnavailable = true;
    }
  }

  return next();
};
