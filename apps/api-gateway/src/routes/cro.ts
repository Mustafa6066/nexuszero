import { Hono } from 'hono';
import { withTenantDb, croAudits } from '@nexuszero/db';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const app = new Hono();

// POST /cro/audit — trigger CRO audit
app.post('/audit', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'ad', type: 'cro_audit', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

// GET /cro/audits — list CRO audit history
app.get('/audits', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(croAudits)
      .where(eq(croAudits.tenantId, tenantId))
      .orderBy(desc(croAudits.createdAt))
      .limit(20);
    return c.json(results);
  });
});

// POST /cro/lead-magnet — generate lead magnet brief
app.post('/lead-magnet', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId, tenantId, agentType: 'ad', type: 'survey_lead_magnet', priority: 'medium', input: body,
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

export { app as croRoutes };
