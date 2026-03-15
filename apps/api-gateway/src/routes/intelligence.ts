import { Hono } from 'hono';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { buildCustomerIntelligence } from '../services/intelligence/index.js';
import { buildDashboardIntelligenceSummary } from '../services/intelligence/dashboard-summary.js';
import { eq, and, desc, sql } from 'drizzle-orm';

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

// GET /intelligence/weekly-digest — LLM-powered weekly summary
app.get('/weekly-digest', async (c) => {
  const tenantId = c.get('tenantId');
  const daysBack = Math.min(30, Math.max(1, parseInt(c.req.query('days') || '7', 10)));

  return withTenantDb(tenantId, async (db) => {
    // Fetch recent actions for the digest window
    const cutoff = new Date(Date.now() - daysBack * 86_400_000).toISOString();

    const actions = await db.select().from(agentActions)
      .where(and(
        eq(agentActions.tenantId, tenantId),
        sql`${agentActions.createdAt} > ${cutoff}::timestamptz`,
      ))
      .orderBy(desc(agentActions.createdAt))
      .limit(200);

    // Group actions by category
    const byCat: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    let totalImpact = 0;
    let impactCount = 0;

    for (const a of actions) {
      byCat[a.category] = (byCat[a.category] || 0) + 1;
      if (a.agentId) byAgent[a.agentId] = (byAgent[a.agentId] || 0) + 1;
      if (a.impactDelta !== null) {
        totalImpact += a.impactDelta;
        impactCount++;
      }
    }

    // Top actions by confidence
    const highlights = actions
      .filter(a => a.confidence && a.confidence > 0.7)
      .slice(0, 5)
      .map(a => ({
        actionType: a.actionType,
        category: a.category,
        reasoning: a.reasoning,
        confidence: a.confidence,
        impactDelta: a.impactDelta,
        impactMetric: a.impactMetric,
        createdAt: a.createdAt,
      }));

    return c.json({
      period: { days: daysBack, from: cutoff, to: new Date().toISOString() },
      totalActions: actions.length,
      byCategory: byCat,
      byAgent,
      avgImpact: impactCount > 0 ? totalImpact / impactCount : 0,
      highlights,
    });
  });
});

export const intelligenceRoutes = app;