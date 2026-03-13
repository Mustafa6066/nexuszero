import { Hono } from 'hono';
import { withTenantDb, agents, agentTasks } from '@nexuszero/db';
import { AppError } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { eq, and, desc, sql } from 'drizzle-orm';

const app = new Hono();

// GET /agents
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const result = await db.select().from(agents).where(eq(agents.tenantId, tenantId));
    return c.json(result);
  });
});

// GET /agents/stats — must be registered before /:id to avoid shadowing
app.get('/stats/overview', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const agentList = await db.select().from(agents).where(eq(agents.tenantId, tenantId));

    const [taskStats] = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      processing: sql<number>`count(*) filter (where status = 'processing')::int`,
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    }).from(agentTasks).where(eq(agentTasks.tenantId, tenantId));

    return c.json({
      agents: agentList.map(a => ({
        id: a.id,
        type: a.type,
        status: a.status,
        tasksCompleted: a.tasksCompleted,
        tasksFailed: a.tasksFailed,
        avgProcessingTimeMs: a.avgProcessingTimeMs,
        lastHeartbeat: a.lastHeartbeat,
      })),
      tasks: taskStats,
    });
  });
});

// GET /agents/:id
app.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [agent] = await db.select().from(agents)
      .where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)))
      .limit(1);

    if (!agent) {
      throw new AppError('AGENT_NOT_FOUND');
    }
    return c.json(agent);
  });
});

// GET /agents/:id/tasks
app.get('/:id/tasks', async (c) => {
  const tenantId = c.get('tenantId');
  const agentId = c.req.param('id');
  const status = c.req.query('status');
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(agentTasks.agentId, agentId), eq(agentTasks.tenantId, tenantId)];
    if (status) conditions.push(eq(agentTasks.status, status as any));

    const tasks = await db.select().from(agentTasks)
      .where(and(...conditions))
      .orderBy(desc(agentTasks.createdAt))
      .limit(limit);

    return c.json(tasks);
  });
});

// POST /agents/:id/signal
app.post('/:id/signal', async (c) => {
  const tenantId = c.get('tenantId');
  const agentId = c.req.param('id');
  const { type, data } = await c.req.json();

  if (!type) {
    throw new AppError('VALIDATION_ERROR', { field: 'type', reason: 'Signal type is required' });
  }

  await publishAgentSignal({
    tenantId,
    agentId,
    type,
    data: data || {},
  });

  return c.json({ sent: true });
});

export { app as agentRoutes };
