import { Hono } from 'hono';
import { withTenantDb, icpProfiles, prospectSignals, dealRecords, salesCallInsights } from '@nexuszero/db';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const app = new Hono();

// POST /sales-pipeline/icp — trigger ICP build
app.post('/icp', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'sales-pipeline', type: 'icp_build', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// GET /sales-pipeline/icp — list ICP profiles
app.get('/icp', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(icpProfiles)
      .where(eq(icpProfiles.tenantId, tenantId))
      .orderBy(desc(icpProfiles.createdAt))
      .limit(20);
    return c.json(results);
  });
});

// POST /sales-pipeline/lead-score — trigger lead scoring
app.post('/lead-score', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'sales-pipeline', type: 'lead_score', priority: 'high', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// GET /sales-pipeline/signals — list prospect signals
app.get('/signals', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(prospectSignals)
      .where(eq(prospectSignals.tenantId, tenantId))
      .orderBy(desc(prospectSignals.detectedAt))
      .limit(50);
    return c.json(results);
  });
});

// POST /sales-pipeline/resurrect — trigger deal resurrection
app.post('/resurrect', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'sales-pipeline', type: 'deal_resurrection', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// GET /sales-pipeline/deals — list deal records
app.get('/deals', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(dealRecords)
      .where(eq(dealRecords.tenantId, tenantId))
      .orderBy(desc(dealRecords.createdAt))
      .limit(50);
    return c.json(results);
  });
});

// POST /sales-pipeline/forecast — trigger pipeline forecast
app.post('/forecast', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'sales-pipeline', type: 'pipeline_forecast', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /sales-pipeline/call-analysis — trigger call analysis
app.post('/call-analysis', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'sales-pipeline', type: 'call_analysis', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// GET /sales-pipeline/call-insights — list call insights
app.get('/call-insights', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(salesCallInsights)
      .where(eq(salesCallInsights.tenantId, tenantId))
      .orderBy(desc(salesCallInsights.createdAt))
      .limit(50);
    return c.json(results);
  });
});

export { app as salesPipelineRoutes };
