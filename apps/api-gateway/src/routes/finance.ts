import { Hono } from 'hono';
import { publishAgentTask } from '@nexuszero/queue';
import { randomUUID } from 'node:crypto';

const app = new Hono();

// POST /finance/cfo-briefing — generate CFO briefing
app.post('/cfo-briefing', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'finance', type: 'cfo_briefing', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /finance/cost-estimate — generate cost estimate
app.post('/cost-estimate', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'finance', type: 'cost_estimate', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /finance/scenario — run scenario model
app.post('/scenario', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'finance', type: 'scenario_model', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

export { app as financeRoutes };
