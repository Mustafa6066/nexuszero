import type { Job } from 'bullmq';
import { getDb, withTenantDb, analyticsDataPoints, campaigns } from '@nexuszero/db';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { queryDailyMetrics, insertMetricSnapshot } from '../clickhouse-client.js';
import { llmDailyInsights } from '../llm.js';
import { publishAgentSignal } from '@nexuszero/queue';
import { detectAnomalies } from '@nexuszero/shared';

export class DailyAnalysisHandler {
  async execute(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;
    const today = new Date().toISOString().split('T')[0]!;

    // 1. Fetch daily metrics from ClickHouse
    const dailyMetrics = await queryDailyMetrics(tenantId, today);

    // 2. Get campaign summaries from Postgres
    const db = getDb();
    const activeCampaigns = await withTenantDb(tenantId, async (tDb) => {
      return tDb.select().from(campaigns)
        .where(eq(campaigns.status, 'active'));
    });

    const campaignSummaries = activeCampaigns.map(c => ({
      name: c.name,
      spend: (c.metrics as any)?.spend ?? 0,
      revenue: (c.metrics as any)?.revenue ?? 0,
      roas: (c.metrics as any)?.roas ?? 0,
    }));

    // 3. Compute aggregate stats
    const avgRoas = dailyMetrics.totalSpend > 0
      ? dailyMetrics.totalRevenue / dailyMetrics.totalSpend : 0;
    const avgCtr = dailyMetrics.totalImpressions > 0
      ? dailyMetrics.totalClicks / dailyMetrics.totalImpressions : 0;
    const avgCpa = dailyMetrics.totalConversions > 0
      ? dailyMetrics.totalSpend / dailyMetrics.totalConversions : 0;

    // 4. Snapshot key metrics to ClickHouse
    await Promise.all([
      insertMetricSnapshot(tenantId, 'daily_spend', dailyMetrics.totalSpend),
      insertMetricSnapshot(tenantId, 'daily_revenue', dailyMetrics.totalRevenue),
      insertMetricSnapshot(tenantId, 'daily_roas', avgRoas),
      insertMetricSnapshot(tenantId, 'daily_ctr', avgCtr),
      insertMetricSnapshot(tenantId, 'daily_conversions', dailyMetrics.totalConversions),
    ]);

    // 5. Check for anomalies in key metrics
    const recentSpendValues = await getRecentMetricValues(tenantId, 'daily_spend', 30);
    if (recentSpendValues.length >= 7) {
      const anomalies = detectAnomalies(recentSpendValues);
      for (const anomaly of anomalies) {
        if (anomaly.index === recentSpendValues.length - 1) {
          await publishAgentSignal({
            tenantId,
            type: 'data.anomaly_detected',
            sourceAgent: 'data_nexus',
            targetAgent: 'broadcast',
            payload: {
              metric: 'daily_spend',
              value: anomaly.value,
              zScore: anomaly.zScore,
              date: today,
            },
            priority: anomaly.zScore > 3 ? 'high' : 'medium',
            confidence: Math.min(0.95, anomaly.zScore / 5),
            correlationId: job.data.correlationId as string,
          });
        }
      }
    }

    // 6. LLM analysis
    const insights = await llmDailyInsights({
      totalSpend: dailyMetrics.totalSpend,
      totalRevenue: dailyMetrics.totalRevenue,
      totalImpressions: dailyMetrics.totalImpressions,
      totalClicks: dailyMetrics.totalClicks,
      totalConversions: dailyMetrics.totalConversions,
      avgRoas,
      avgCtr,
      avgCpa,
      channelBreakdown: dailyMetrics.channelBreakdown,
      campaignSummaries,
    });

    // 7. Store data point in Postgres
    await withTenantDb(tenantId, async (tDb) => {
      await tDb.insert(analyticsDataPoints).values({
        tenantId,
        channel: 'direct',
        granularity: 'daily',
        attributionModel: 'last_touch',
        date: new Date(today),
        impressions: dailyMetrics.totalImpressions,
        clicks: dailyMetrics.totalClicks,
        conversions: dailyMetrics.totalConversions,
        spend: dailyMetrics.totalSpend,
        revenue: dailyMetrics.totalRevenue,
        ctr: avgCtr,
        cpc: dailyMetrics.totalClicks > 0 ? dailyMetrics.totalSpend / dailyMetrics.totalClicks : 0,
        cpa: avgCpa,
        roas: avgRoas,
        metadata: insights,
      });
    });

    // 8. Broadcast insight
    await publishAgentSignal({
      tenantId,
      type: 'data.insight_generated',
      sourceAgent: 'data_nexus',
      targetAgent: 'broadcast',
      payload: {
        analysisType: 'daily',
        date: today,
        summary: insights.summary,
        alerts: insights.alerts,
      },
      priority: insights.alerts.length > 0 ? 'high' : 'low',
      confidence: 0.85,
      correlationId: job.data.correlationId as string,
    });

    return {
      date: today,
      metrics: dailyMetrics,
      insights,
      campaignsAnalyzed: activeCampaigns.length,
    };
  }
}

async function getRecentMetricValues(tenantId: string, metricName: string, days: number): Promise<number[]> {
  const { queryMetricHistory } = await import('../clickhouse-client.js');
  const history = await queryMetricHistory(tenantId, metricName, days);
  return history.map(h => h.value);
}
