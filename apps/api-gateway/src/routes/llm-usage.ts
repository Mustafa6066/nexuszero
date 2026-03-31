import { Hono } from 'hono';
import {
  getTenantDailyUsage, getTenantMonthlyUsage,
  getRecentUsage, checkBudget, MODEL_PRICING,
} from '@nexuszero/llm-router';

const app = new Hono();

/** GET /api/v1/llm-usage/daily?date=YYYY-MM-DD */
app.get('/daily', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const date = c.req.query('date');
  const usage = await getTenantDailyUsage(tenantId, date || undefined);
  return c.json({ data: usage });
});

/** GET /api/v1/llm-usage/monthly?month=YYYY-MM */
app.get('/monthly', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const month = c.req.query('month');
  const usage = await getTenantMonthlyUsage(tenantId, month || undefined);
  return c.json({ data: usage });
});

/** GET /api/v1/llm-usage/recent?limit=50 */
app.get('/recent', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));
  const records = await getRecentUsage(tenantId, limit);
  return c.json({ data: records });
});

/** GET /api/v1/llm-usage/budget */
app.get('/budget', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const plan = (c.get('plan') as string) ?? 'launchpad';
  const budget = await checkBudget(tenantId, plan);
  return c.json({ data: budget });
});

/** GET /api/v1/llm-usage/pricing */
app.get('/pricing', async (c) => {
  return c.json({ data: MODEL_PRICING });
});

export default app;
