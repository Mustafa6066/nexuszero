import { Hono } from 'hono';
import { getDb, withTenantDb, tenants, users } from '@nexuszero/db';
import { createTenantSchema, loginSchema, updateTenantSchema, AppError, hashPassword, verifyPassword, generateApiKey, sha256Hash } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';
import { signJwt } from '../middleware/auth.js';
import { apiKeys } from '@nexuszero/db';

const app = new Hono();

// Simple in-process IP-based rate limiter for the login endpoint.
// Stores request timestamps (epoch seconds) per IP in a sliding window.
const loginAttempts = new Map<string, number[]>();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 60;

function isLoginRateLimited(ip: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - LOGIN_WINDOW_SECONDS;
  const attempts = (loginAttempts.get(ip) ?? []).filter(t => t > windowStart);
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  // Prevent unbounded memory growth: cap number of tracked IPs at 10 000
  if (loginAttempts.size > 10_000) {
    const oldest = loginAttempts.keys().next().value;
    if (oldest) loginAttempts.delete(oldest);
  }
  return attempts.length > LOGIN_MAX_ATTEMPTS;
}

// POST /auth/login
app.post('/login', async (c) => {
  const ip = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? c.req.header('X-Real-IP') ?? 'unknown';
  if (isLoginRateLimited(ip)) {
    throw new AppError('RATE_LIMIT_EXCEEDED');
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues);
  }
  const { email, password } = parsed.data;

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new AppError('AUTH_INVALID_TOKEN', { reason: 'Invalid credentials' });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError('AUTH_INVALID_TOKEN', { reason: 'Invalid credentials' });
  }

  const token = signJwt({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  return c.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId } });
});

// GET /tenants/me
app.get('/me', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) {
      throw new AppError('TENANT_NOT_FOUND');
    }
    return c.json(tenant);
  });
});

// PATCH /tenants/me
app.patch('/me', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const parsed = updateTenantSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', parsed.error.issues);
  }
  const { name, domain, settings } = parsed.data;

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(tenants)
      .set({
        ...(name && { name }),
        ...(domain !== undefined && { domain }),
        ...(settings && { settings }),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    return c.json(updated);
  });
});

// GET /tenants/users
app.get('/users', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const result = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.tenantId, tenantId));
    return c.json(result);
  });
});

// POST /tenants/api-keys
app.post('/api-keys', async (c) => {
  const tenantId = c.get('tenantId');
  const { name, scopes } = await c.req.json();
  if (!name) {
    throw new AppError('VALIDATION_ERROR', { field: 'name', reason: 'Name is required' });
  }

  const rawKey = generateApiKey();
  const keyHash = sha256Hash(rawKey);

  const db = getDb();
  const [key] = await db.insert(apiKeys).values({
    tenantId,
    name,
    keyHash,
    keyPrefix: rawKey.substring(0, 7),
    scopes: scopes || ['read', 'write'],
  }).returning();

  return c.json({ ...key, key: rawKey }, 201);
});

export { app as tenantRoutes };
