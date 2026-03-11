import type { Context, Next } from 'hono';
import Redis from 'ioredis';
import { AppError, PLAN_RATE_LIMITS } from '@nexuszero/shared';
import { getDb, tenants } from '@nexuszero/db';
import { eq } from 'drizzle-orm';

let redis: Redis | null = null;

function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
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

  const plan = await getTenantPlan(tenantId);
  const limit = PLAN_RATE_LIMITS[plan as keyof typeof PLAN_RATE_LIMITS] || PLAN_RATE_LIMITS.launchpad;

  const r = getRedis();
  const key = `ratelimit:${tenantId}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 60;

  const pipe = r.pipeline();
  pipe.zremrangebyscore(key, 0, windowStart);
  pipe.zadd(key, now, `${now}:${Math.random()}`);
  pipe.zcard(key);
  pipe.expire(key, 120);
  const results = await pipe.exec();

  const count = (results?.[2]?.[1] as number) || 0;

  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
  c.header('X-RateLimit-Reset', String(now + 60));

  if (count > limit) {
    throw new AppError('RATE_LIMIT_EXCEEDED', { limit, resetAt: now + 60 });
  }

  return next();
};
