import { Hono } from 'hono';
import { getDb, withTenantDb, approvalQueue, tenants } from '@nexuszero/db';
import { AppError } from '@nexuszero/shared';
import { eq, and, desc } from 'drizzle-orm';

const app = new Hono();

// GET /approvals — list pending approvals for this tenant
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const status = c.req.query('status') || 'pending';

  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(approvalQueue)
      .where(and(
        eq(approvalQueue.tenantId, tenantId),
        eq(approvalQueue.status, status as any),
      ))
      .orderBy(desc(approvalQueue.createdAt))
      .limit(50);

    return c.json(results);
  });
});

// GET /approvals/count — get count of pending approvals
app.get('/count', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(approvalQueue)
      .where(and(
        eq(approvalQueue.tenantId, tenantId),
        eq(approvalQueue.status, 'pending'),
      ));

    return c.json({ count: results.length });
  });
});

// POST /approvals/:id/approve
app.post('/:id/approve', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const approvalId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  // Only owner/admin can approve
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw new AppError('AUTH_INSUFFICIENT_PERMISSIONS');
  }

  return withTenantDb(tenantId, async (db) => {
    const [item] = await db.select().from(approvalQueue)
      .where(and(
        eq(approvalQueue.id, approvalId),
        eq(approvalQueue.tenantId, tenantId),
        eq(approvalQueue.status, 'pending'),
      ))
      .limit(1);

    if (!item) {
      throw new AppError('VALIDATION_ERROR', { reason: 'Approval not found or already resolved' });
    }

    const [updated] = await db.update(approvalQueue)
      .set({
        status: 'approved',
        reviewedBy: user.userId,
        reviewedAt: new Date(),
        reviewNote: body.note || null,
      })
      .where(eq(approvalQueue.id, approvalId))
      .returning();

    return c.json(updated);
  });
});

// POST /approvals/:id/reject
app.post('/:id/reject', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const approvalId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  if (user.role !== 'owner' && user.role !== 'admin') {
    throw new AppError('AUTH_INSUFFICIENT_PERMISSIONS');
  }

  return withTenantDb(tenantId, async (db) => {
    const [item] = await db.select().from(approvalQueue)
      .where(and(
        eq(approvalQueue.id, approvalId),
        eq(approvalQueue.tenantId, tenantId),
        eq(approvalQueue.status, 'pending'),
      ))
      .limit(1);

    if (!item) {
      throw new AppError('VALIDATION_ERROR', { reason: 'Approval not found or already resolved' });
    }

    const [updated] = await db.update(approvalQueue)
      .set({
        status: 'rejected',
        reviewedBy: user.userId,
        reviewedAt: new Date(),
        reviewNote: body.note || null,
      })
      .where(eq(approvalQueue.id, approvalId))
      .returning();

    return c.json(updated);
  });
});

// GET /approvals/autonomy — get tenant autonomy level
app.get('/autonomy', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const [tenant] = await db.select({ autonomyLevel: tenants.autonomyLevel })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return c.json({ autonomyLevel: tenant?.autonomyLevel ?? 'manual' });
  });
});

// PATCH /approvals/autonomy — update autonomy level
app.patch('/autonomy', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  if (user.role !== 'owner') {
    throw new AppError('AUTH_INSUFFICIENT_PERMISSIONS');
  }

  const level = body.autonomyLevel;
  if (!['manual', 'guardrailed', 'autonomous'].includes(level)) {
    throw new AppError('VALIDATION_ERROR', { reason: 'autonomyLevel must be manual, guardrailed, or autonomous' });
  }

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(tenants)
      .set({ autonomyLevel: level, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();
    return c.json({ autonomyLevel: updated.autonomyLevel });
  });
});

export { app as approvalRoutes };
