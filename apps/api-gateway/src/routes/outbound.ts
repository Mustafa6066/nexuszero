import { Hono } from 'hono';
import { withTenantDb, outboundCampaigns } from '@nexuszero/db';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const app = new Hono();

// POST /outbound/sequence — build outbound sequence
app.post('/sequence', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'outbound', type: 'sequence_build', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// GET /outbound/campaigns — list outbound campaigns
app.get('/campaigns', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(outboundCampaigns)
      .where(eq(outboundCampaigns.tenantId, tenantId))
      .orderBy(desc(outboundCampaigns.createdAt))
      .limit(50);
    return c.json(results);
  });
});

// POST /outbound/campaigns/:id/score — score campaign performance
app.post('/campaigns/:id/score', async (c) => {
  const tenantId = c.get('tenantId');
  const campaignId = c.req.param('id');
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'outbound', type: 'campaign_score', priority: 'medium', input: { campaignId },
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /outbound/verify-leads — verify lead list
app.post('/verify-leads', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'outbound', type: 'lead_verification', priority: 'high', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /outbound/competitor-monitor — trigger competitive monitoring
app.post('/competitor-monitor', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'outbound', type: 'competitor_monitor', priority: 'low', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /outbound/warmup — manage email warmup
app.post('/warmup', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'outbound', type: 'email_warmup', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

export { app as outboundRoutes };
