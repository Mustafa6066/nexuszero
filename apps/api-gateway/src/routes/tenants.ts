import { Hono } from 'hono';
import { getDb, withTenantDb, tenants, users, loginStreaks } from '@nexuszero/db';
import { createTenantSchema, loginSchema, registerSchema, updateTenantSchema, AppError, hashPassword, verifyPassword, generateApiKey, sha256Hash } from '@nexuszero/shared';
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

  // Update login streak
  const today = new Date().toISOString().slice(0, 10);
  const [existing] = await db.select().from(loginStreaks)
    .where(and(eq(loginStreaks.userId, user.id), eq(loginStreaks.tenantId, user.tenantId))).limit(1);

  if (existing) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const newStreak = existing.lastLoginDate === yesterday
      ? existing.currentStreak + 1
      : existing.lastLoginDate === today ? existing.currentStreak : 1;
    await db.update(loginStreaks)
      .set({
        currentStreak: newStreak,
        longestStreak: Math.max(existing.longestStreak, newStreak),
        lastLoginDate: today,
        totalLogins: existing.totalLogins + (existing.lastLoginDate === today ? 0 : 1),
        updatedAt: new Date(),
      })
      .where(eq(loginStreaks.id, existing.id));
  } else {
    await db.insert(loginStreaks).values({
      tenantId: user.tenantId,
      userId: user.id,
      currentStreak: 1,
      longestStreak: 1,
      lastLoginDate: today,
      totalLogins: 1,
    });
  }

  // Update lastLoginAt
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const token = signJwt({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  return c.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId } });
});

// POST /auth/register
app.post('/register', async (c) => {
  const ip = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? c.req.header('X-Real-IP') ?? 'unknown';
  if (isLoginRateLimited(ip)) {
    throw new AppError('RATE_LIMIT_EXCEEDED');
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues);
  }
  const { name, email, password, companyName } = parsed.data;

  const db = getDb();

  // Check if email already exists
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    throw new AppError('VALIDATION_ERROR', { field: 'email', reason: 'An account with this email already exists' });
  }

  // Generate slug from company name
  const baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  // Check slug uniqueness
  const [existingTenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (existingTenant) {
    throw new AppError('TENANT_SLUG_TAKEN');
  }

  const passwordHash = hashPassword(password);

  // Create tenant
  const [tenant] = await db.insert(tenants).values({
    name: companyName,
    slug,
    plan: 'launchpad',
    status: 'pending',
    onboardingState: 'created',
    autonomyLevel: 'manual',
    settings: {},
  }).returning();

  // Create owner user
  const [user] = await db.insert(users).values({
    tenantId: tenant.id,
    email,
    name,
    passwordHash,
    role: 'owner',
  }).returning();

  // Initialize login streak
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(loginStreaks).values({
    tenantId: tenant.id,
    userId: user.id,
    currentStreak: 1,
    longestStreak: 1,
    lastLoginDate: today,
    totalLogins: 1,
  });

  const token = signJwt({
    userId: user.id,
    tenantId: tenant.id,
    email: user.email,
    role: user.role,
  });

  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: tenant.id },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
  }, 201);
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
