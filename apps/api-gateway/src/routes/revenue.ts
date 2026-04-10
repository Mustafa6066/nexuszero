import { Hono } from 'hono';
import { withTenantDb, revenueAttributions } from '@nexuszero/db';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const app = new Hono();

// POST /revenue/attribution — trigger revenue attribution
app.post('/attribution', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'data-nexus', type: 'revenue_attribution', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// GET /revenue/attributions — list attribution results
app.get('/attributions', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(revenueAttributions)
      .where(eq(revenueAttributions.tenantId, tenantId))
      .orderBy(desc(revenueAttributions.createdAt))
      .limit(50);
    return c.json(results);
  });
});

// POST /revenue/client-report — generate client report
app.post('/client-report', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'data-nexus', type: 'client_report', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

export { app as revenueRoutes };
