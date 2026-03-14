import { Hono } from 'hono';
import { withTenantDb, alertRules } from '@nexuszero/db';
import { AppError } from '@nexuszero/shared';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

const createAlertSchema = z.object({
  name: z.string().min(1).max(200),
  metric: z.string().min(1).max(100),
  operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte']),
  threshold: z.string().min(1),
  channels: z.array(z.enum(['in_app', 'email', 'webhook'])).default(['in_app']),
  cooldownMinutes: z.number().int().min(5).max(10080).default(60),
});

const app = new Hono();

// GET /alerts — list alert rules
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(alertRules)
      .where(eq(alertRules.tenantId, tenantId))
      .orderBy(desc(alertRules.createdAt));
    return c.json(results);
  });
});

// POST /alerts — create alert rule
app.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const parsed = createAlertSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues);
  }

  return withTenantDb(tenantId, async (db) => {
    const [rule] = await db.insert(alertRules).values({
      tenantId,
      createdBy: user.userId,
      ...parsed.data,
    }).returning();
    return c.json(rule, 201);
  });
});

// PATCH /alerts/:id — toggle active/inactive
app.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const ruleId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(alertRules)
      .set({
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.name && { name: body.name }),
        ...(body.threshold && { threshold: body.threshold }),
        ...(body.channels && { channels: body.channels }),
        updatedAt: new Date(),
      })
      .where(and(eq(alertRules.id, ruleId), eq(alertRules.tenantId, tenantId)))
      .returning();

    if (!updated) {
      throw new AppError('VALIDATION_ERROR', { reason: 'Alert rule not found' });
    }
    return c.json(updated);
  });
});

// DELETE /alerts/:id — remove rule
app.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const ruleId = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    await db.delete(alertRules)
      .where(and(eq(alertRules.id, ruleId), eq(alertRules.tenantId, tenantId)));
    return c.json({ ok: true });
  });
});

export { app as alertRoutes };
