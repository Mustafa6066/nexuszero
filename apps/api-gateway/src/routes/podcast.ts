import { Hono } from 'hono';
import { publishAgentTask } from '@nexuszero/queue';
import { randomUUID } from 'node:crypto';

const app = new Hono();

// POST /podcast/ingest — ingest podcast episode
app.post('/ingest', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'podcast', type: 'podcast_ingest', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /podcast/extract — extract content atoms
app.post('/extract', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'podcast', type: 'content_extract', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /podcast/generate — generate platform content
app.post('/generate', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'podcast', type: 'content_generate', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /podcast/viral-score — score content for virality
app.post('/viral-score', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'podcast', type: 'viral_score', priority: 'low', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /podcast/calendar — build content calendar
app.post('/calendar', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'podcast', type: 'calendar_build', priority: 'low', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

export { app as podcastRoutes };
