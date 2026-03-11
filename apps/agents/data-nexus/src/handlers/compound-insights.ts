import type { Job } from 'bullmq';
import { getDb, compoundInsights, tenants } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { queryCrossTenantPatterns } from '../clickhouse-client.js';
import { llmGenerateCompoundInsights } from '../llm.js';

export class CompoundInsightsHandler {
  async execute(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    // 1. Get anonymized cross-tenant patterns from ClickHouse
    const patterns = await queryCrossTenantPatterns();

    if (patterns.totalTenants < 3) {
      return {
        insightsGenerated: 0,
        reason: 'Insufficient tenant data for compound insights (minimum 3 required)',
      };
    }

    // 2. Get industry distribution for context
    const db = getDb();
    const allTenants = await db.select({
      industry: tenants.industry,
      plan: tenants.plan,
    }).from(tenants).where(eq(tenants.status, 'active'));

    const industryDistribution: Record<string, number> = {};
    for (const t of allTenants) {
      const ind = (t.industry as string) || 'unknown';
      industryDistribution[ind] = (industryDistribution[ind] || 0) + 1;
    }

    // 3. Build performance benchmarks
    const benchmarks: Record<string, number> = {};
    for (const [channel, data] of Object.entries(patterns.channelPerformance)) {
      benchmarks[`${channel}_roas`] = data.avgRoas;
      benchmarks[`${channel}_ctr`] = data.avgCtr;
    }

    // 4. LLM compound insight generation
    const insights = await llmGenerateCompoundInsights({
      industryPatterns: {
        distribution: industryDistribution,
        channelPerformance: patterns.channelPerformance,
      },
      commonTrends: patterns.trends.map(t => ({
        trend: `${t.metric} trending ${t.direction}`,
        count: Math.round(t.magnitude * 100),
      })),
      performanceBenchmarks: benchmarks,
      sampleSize: patterns.totalTenants,
    });

    // 5. Store insights in Postgres (no tenant_id - cross-tenant table)
    let stored = 0;
    for (const insight of insights) {
      const insightType = validateInsightType(insight.type);
      if (!insightType) continue;

      await db.insert(compoundInsights).values({
        insightType,
        title: String(insight.title || '').slice(0, 500),
        description: String(insight.description || ''),
        confidence: Math.min(1, Math.max(0, insight.confidence || 0.5)),
        sampleSize: patterns.totalTenants,
        dataPoints: {
          channelPerformance: patterns.channelPerformance,
          trends: patterns.trends.slice(0, 10),
        },
        recommendations: insight.recommendations || [],
        effectiveFrom: new Date(),
        effectiveUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });
      stored++;
    }

    return {
      insightsGenerated: stored,
      totalTenantsAnalyzed: patterns.totalTenants,
      industriesCovered: Object.keys(industryDistribution).length,
      insights: insights.map(i => ({ type: i.type, title: i.title, confidence: i.confidence })),
    };
  }
}

const VALID_INSIGHT_TYPES = new Set([
  'performance_pattern',
  'audience_behavior',
  'creative_trend',
  'channel_correlation',
  'seasonal_pattern',
  'anomaly_detection',
]);

function validateInsightType(type: string): string | null {
  return VALID_INSIGHT_TYPES.has(type) ? type : null;
}
