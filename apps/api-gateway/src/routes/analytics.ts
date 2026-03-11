import { Hono } from 'hono';
import { withTenantDb, analyticsDataPoints, funnelAnalysis, forecasts } from '@nexuszero/db';
import { analyticsQuerySchema, AppError, ERROR_CODES } from '@nexuszero/shared';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

const app = new Hono();

// GET /analytics/data-points
app.get('/data-points', async (c) => {
  const tenantId = c.get('tenantId');
  const query = c.req.query();
  const filters = analyticsQuerySchema.parse({
    startDate: query.startDate,
    endDate: query.endDate,
    granularity: query.granularity,
    channel: query.channel,
    campaignId: query.campaignId,
  });

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(analyticsDataPoints.tenantId, tenantId)];
    if (filters.startDate) conditions.push(gte(analyticsDataPoints.date, new Date(filters.startDate)));
    if (filters.endDate) conditions.push(lte(analyticsDataPoints.date, new Date(filters.endDate)));
    if (filters.granularity) conditions.push(eq(analyticsDataPoints.granularity, filters.granularity as any));
    if (filters.channel) conditions.push(eq(analyticsDataPoints.channel, filters.channel as any));
    if (filters.campaignId) conditions.push(eq(analyticsDataPoints.campaignId, filters.campaignId));

    const result = await db.select().from(analyticsDataPoints)
      .where(and(...conditions))
      .orderBy(desc(analyticsDataPoints.date))
      .limit(1000);

    return c.json(result);
  });
});

// GET /analytics/summary
app.get('/summary', async (c) => {
  const tenantId = c.get('tenantId');
  const days = Math.min(365, Math.max(1, parseInt(c.req.query('days') || '30', 10)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return withTenantDb(tenantId, async (db) => {
    const [summary] = await db.select({
      totalImpressions: sql<number>`coalesce(sum(impressions), 0)::int`,
      totalClicks: sql<number>`coalesce(sum(clicks), 0)::int`,
      totalConversions: sql<number>`coalesce(sum(conversions), 0)::int`,
      totalSpend: sql<number>`coalesce(sum(spend), 0)::real`,
      totalRevenue: sql<number>`coalesce(sum(revenue), 0)::real`,
      avgCtr: sql<number>`coalesce(avg(ctr), 0)::real`,
      avgCpc: sql<number>`coalesce(avg(cpc), 0)::real`,
      avgRoas: sql<number>`coalesce(avg(roas), 0)::real`,
    }).from(analyticsDataPoints)
      .where(and(
        eq(analyticsDataPoints.tenantId, tenantId),
        gte(analyticsDataPoints.date, since),
      ));

    return c.json(summary);
  });
});

// GET /analytics/funnel
app.get('/funnel', async (c) => {
  const tenantId = c.get('tenantId');
  const campaignId = c.req.query('campaignId');
  const days = Math.min(365, Math.max(1, parseInt(c.req.query('days') || '30', 10)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return withTenantDb(tenantId, async (db) => {
    const conditions = [
      eq(funnelAnalysis.tenantId, tenantId),
      gte(funnelAnalysis.date, since),
    ];
    if (campaignId) conditions.push(eq(funnelAnalysis.campaignId, campaignId));

    const result = await db.select().from(funnelAnalysis)
      .where(and(...conditions))
      .orderBy(funnelAnalysis.stage);
    return c.json(result);
  });
});

// GET /analytics/forecasts
app.get('/forecasts', async (c) => {
  const tenantId = c.get('tenantId');
  const metric = c.req.query('metric');

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(forecasts.tenantId, tenantId)];
    if (metric) conditions.push(eq(forecasts.metric, metric));

    const result = await db.select().from(forecasts)
      .where(and(...conditions))
      .orderBy(forecasts.forecastDate)
      .limit(90);
    return c.json(result);
  });
});

export { app as analyticsRoutes };
