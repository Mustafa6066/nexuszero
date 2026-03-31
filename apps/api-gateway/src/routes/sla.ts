import { Hono } from 'hono';
import { getTenantSlaSummary, getRecentBreaches, PRIORITY_LANES } from '@nexuszero/queue';

const app = new Hono();

/** GET /api/v1/sla/summary?date=YYYY-MM-DD */
app.get('/summary', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const date = c.req.query('date');
  const summary = await getTenantSlaSummary(tenantId, date || undefined);
  return c.json({ data: summary });
});

/** GET /api/v1/sla/breaches?limit=20 */
app.get('/breaches', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
  const breaches = await getRecentBreaches(tenantId, limit);
  return c.json({ data: breaches });
});

/** GET /api/v1/sla/targets — returns SLA definitions per priority */
app.get('/targets', async (c) => {
  return c.json({ data: PRIORITY_LANES });
});

export default app;
