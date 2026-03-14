import { Hono } from 'hono';
import { buildCustomerIntelligence } from '../services/intelligence/index.js';
import { buildDashboardIntelligenceSummary } from '../services/intelligence/dashboard-summary.js';

const app = new Hono();

app.get('/summary', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');

  const intelligence = await buildCustomerIntelligence(tenantId, user.userId);

  return c.json({
    ...intelligence,
    dashboard: buildDashboardIntelligenceSummary(intelligence),
  });
});

export const intelligenceRoutes = app;