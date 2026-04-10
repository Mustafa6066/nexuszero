import { Hono } from 'hono';
import { withTenantDb, tenants } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { publishAgentTask } from '@nexuszero/queue';
import { randomUUID } from 'node:crypto';

const app = new Hono();

/** GET /strategy — fetch the tenant's current strategy document */
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return c.json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } }, 404);

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const strategy = settings.strategy as Record<string, unknown> | undefined;

    if (!strategy) {
      return c.json({ strategy: null, generated: false });
    }

    return c.json({
      strategy,
      generated: true,
      generatedAt: strategy.generatedAt ?? null,
    });
  });
});

/** POST /strategy/regenerate — regenerate strategy with current context */
app.post('/regenerate', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const { businessType, goal, channel } = body as { businessType?: string; goal?: string; channel?: string };

  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId,
    tenantId,
    agentType: 'compatibility',
    type: 'strategy_generate',
    priority: 'high',
    input: {
      regenerate: true,
      businessType,
      goal,
      channel,
    },
  });

  return c.json({ taskId, status: 'queued' });
});

/** PATCH /strategy/milestones/:id — update a milestone's status */
app.patch('/milestones/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const milestoneId = c.req.param('id');
  const body = await c.req.json();
  const { status, notes } = body as { status?: string; notes?: string };

  return withTenantDb(tenantId, async (db) => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return c.json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } }, 404);

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const strategy = (settings.strategy || {}) as Record<string, unknown>;
    const milestones = (strategy.milestones || []) as Array<Record<string, unknown>>;

    const milestone = milestones.find((m) => m.id === milestoneId);
    if (!milestone) return c.json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } }, 404);

    if (status) milestone.status = status;
    if (notes !== undefined) milestone.notes = notes;
    milestone.updatedAt = new Date().toISOString();

    strategy.milestones = milestones;
    settings.strategy = strategy;

    await db.update(tenants).set({ settings }).where(eq(tenants.id, tenantId));

    return c.json({ milestone });
  });
});

export { app as strategyRoutes };
