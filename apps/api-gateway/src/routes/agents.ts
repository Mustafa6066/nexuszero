import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { withTenantDb, agents, agentTasks, agentActions } from '@nexuszero/db';
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

// GET /agents/actions/recent — cross-agent recent actions feed
app.get('/actions/recent', async (c) => {
  const tenantId = c.get('tenantId');
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const category = c.req.query('category');

  return withTenantDb(tenantId, async (db) => {
    const conditions: any[] = [eq(agentActions.tenantId, tenantId)];
    if (category) conditions.push(eq(agentActions.category, category as any));

    const actions = await db.select().from(agentActions)
      .where(and(...conditions))
      .orderBy(desc(agentActions.createdAt))
      .limit(limit);

    return c.json(actions);
  });
});

// GET /agents/actions/:actionId — single action detail
app.get('/actions/:actionId', async (c) => {
  const tenantId = c.get('tenantId');
  const actionId = c.req.param('actionId');

  return withTenantDb(tenantId, async (db) => {
    const [action] = await db.select().from(agentActions)
      .where(and(eq(agentActions.id, actionId), eq(agentActions.tenantId, tenantId)))
      .limit(1);

    if (!action) {
      throw new AppError('VALIDATION_ERROR', { reason: 'Action not found' });
    }
    return c.json(action);
  });
});

// GET /agents/:id/actions — paginated action log for specific agent
app.get('/:id/actions', async (c) => {
  const tenantId = c.get('tenantId');
  const agentId = c.req.param('id');
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const category = c.req.query('category');

  return withTenantDb(tenantId, async (db) => {
    const conditions: any[] = [
      eq(agentActions.agentId, agentId),
      eq(agentActions.tenantId, tenantId),
    ];
    if (category) conditions.push(eq(agentActions.category, category as any));

    const actions = await db.select().from(agentActions)
      .where(and(...conditions))
      .orderBy(desc(agentActions.createdAt))
      .limit(limit);

    return c.json(actions);
  });
});

// GET /agents/stream — SSE stream of real-time agent actions
app.get('/stream', async (c) => {
  const tenantId = c.get('tenantId');

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return streamSSE(c, async (stream) => {
    let lastChecked = new Date().toISOString();

    // Poll for new actions every 3 seconds
    const poll = async () => {
      try {
        const actions = await withTenantDb(tenantId, async (db) => {
          return db.select().from(agentActions)
            .where(and(
              eq(agentActions.tenantId, tenantId),
              sql`${agentActions.createdAt} > ${lastChecked}::timestamptz`,
            ))
            .orderBy(desc(agentActions.createdAt))
            .limit(10);
        });

        if (actions.length > 0) {
          lastChecked = new Date().toISOString();
          for (const action of actions) {
            await stream.writeSSE({
              event: 'agent-action',
              data: JSON.stringify(action),
            });
          }
        }
      } catch {
        // Swallow polling errors — stream stays alive
      }
    };

    // Initial heartbeat
    await stream.writeSSE({ event: 'heartbeat', data: '{"type":"connected"}' });

    // Poll loop — runs until client disconnects
    while (true) {
      await poll();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await stream.writeSSE({ event: 'heartbeat', data: `{"ts":"${new Date().toISOString()}"}` });
    }
  });
});

// POST /agents/emergency-stop — pause all agents for this tenant
app.post('/emergency-stop', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');

  if (user.role !== 'owner' && user.role !== 'admin') {
    throw new AppError('AUTH_INSUFFICIENT_PERMISSIONS');
  }

  return withTenantDb(tenantId, async (db) => {
    const agentList = await db.select().from(agents)
      .where(eq(agents.tenantId, tenantId));

    // Pause all agents
    await db.update(agents)
      .set({ status: 'paused' })
      .where(eq(agents.tenantId, tenantId));

    // Log the emergency stop action for each active agent
    const stoppedAgents = agentList.filter(a => a.status === 'active' || a.status === 'processing');
    for (const agent of stoppedAgents) {
      await db.insert(agentActions).values({
        tenantId,
        agentId: agent.id,
        actionType: 'emergency_stop',
        category: 'alert',
        reasoning: `Emergency stop triggered by ${user.role} (${user.userId})`,
        beforeState: { status: agent.status },
        afterState: { status: 'paused' },
      });
    }

    return c.json({ stopped: stoppedAgents.length, total: agentList.length });
  });
});

export { app as agentRoutes };
