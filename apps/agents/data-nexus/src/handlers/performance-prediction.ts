import type { Job } from 'bullmq';
import { withTenantDb, creatives, analyticsDataPoints } from '@nexuszero/db';
import { eq, and, desc } from 'drizzle-orm';
import { queryMetricHistory } from '../clickhouse-client.js';
import { llmPredictPerformance } from '../llm.js';

export class PerformancePredictionHandler {
  async execute(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;
    const creativeId = input.creativeId as string | undefined;
    const campaignId = input.campaignId as string | undefined;

    if (creativeId) {
      return this.predictCreativePerformance(tenantId, creativeId, job);
    }

    if (campaignId) {
      return this.predictCampaignPerformance(tenantId, campaignId, job);
    }

    return { error: 'Either creativeId or campaignId is required' };
  }

  private async predictCreativePerformance(
    tenantId: string,
    creativeId: string,
    job: Job,
  ): Promise<Record<string, unknown>> {
    // 1. Get creative details
    const creative = await withTenantDb(tenantId, async (tDb) => {
      const [c] = await tDb.select().from(creatives)
        .where(eq(creatives.id, creativeId))
        .limit(1);
      return c;
    });

    if (!creative) {
      return { error: 'Creative not found', creativeId };
    }

    // 2. Get historical performance of similar creatives
    const historicalCreatives = await withTenantDb(tenantId, async (tDb) => {
      return tDb.select().from(creatives)
        .where(and(
          eq(creatives.type, creative.type),
          eq(creatives.status, 'active'),
        ))
        .orderBy(desc(creatives.createdAt))
        .limit(20);
    });

    const historicalPerformance = historicalCreatives
      .filter(c => c.performanceScore != null)
      .map(c => ({
        type: c.type,
        ctr: (c.metadata as any)?.ctr ?? 0.02,
        conversionRate: (c.metadata as any)?.conversionRate ?? 0.01,
      }));

    // 3. LLM performance prediction
    const prediction = await llmPredictPerformance({
      type: creative.type,
      platform: (creative.metadata as any)?.platform || 'unknown',
      content: {
        name: creative.name,
        type: creative.type,
        metadata: creative.metadata,
      },
      historicalPerformance,
    });

    // 4. Update creative metadata with prediction
    await withTenantDb(tenantId, async (tDb) => {
      const currentMeta = (creative.metadata as Record<string, unknown>) || {};
      await tDb.update(creatives)
        .set({
          metadata: {
            ...currentMeta,
            prediction: {
              predictedCtr: prediction.predictedCtr,
              predictedConversionRate: prediction.predictedConversionRate,
              confidence: prediction.confidence,
              reasoning: prediction.reasoning,
              predictedAt: new Date().toISOString(),
            },
          },
        })
        .where(eq(creatives.id, creativeId));
    });

    return {
      creativeId,
      prediction,
      historicalSampleSize: historicalPerformance.length,
    };
  }

  private async predictCampaignPerformance(
    tenantId: string,
    campaignId: string,
    job: Job,
  ): Promise<Record<string, unknown>> {
    // 1. Get historical CTR and ROAS for the campaign
    const ctrHistory = await queryMetricHistory(tenantId, 'daily_ctr', 30);
    const roasHistory = await queryMetricHistory(tenantId, 'daily_roas', 30);

    const ctrValues = ctrHistory.map(h => h.value);
    const roasValues = roasHistory.map(h => h.value);

    // 2. Get recent analytics data points for this campaign
    const recentData = await withTenantDb(tenantId, async (tDb) => {
      return tDb.select().from(analyticsDataPoints)
        .where(eq(analyticsDataPoints.campaignId, campaignId))
        .orderBy(desc(analyticsDataPoints.date))
        .limit(30);
    });

    // 3. Compute averages and trends
    const avgCtr = ctrValues.length > 0
      ? ctrValues.reduce((s, v) => s + v, 0) / ctrValues.length : 0;
    const avgRoas = roasValues.length > 0
      ? roasValues.reduce((s, v) => s + v, 0) / roasValues.length : 0;

    const recentAvgCtr = recentData.length > 0
      ? recentData.reduce((s, d) => s + d.ctr, 0) / recentData.length : avgCtr;
    const recentAvgRoas = recentData.length > 0
      ? recentData.reduce((s, d) => s + d.roas, 0) / recentData.length : avgRoas;

    // 4. Simple momentum-based prediction
    const ctrMomentum = ctrValues.length > 1
      ? (ctrValues[ctrValues.length - 1]! - ctrValues[0]!) / ctrValues.length : 0;
    const roasMomentum = roasValues.length > 1
      ? (roasValues[roasValues.length - 1]! - roasValues[0]!) / roasValues.length : 0;

    const predictedCtr = Math.max(0, recentAvgCtr + ctrMomentum * 7); // 7-day forecast
    const predictedRoas = Math.max(0, recentAvgRoas + roasMomentum * 7);

    return {
      campaignId,
      currentMetrics: { avgCtr: recentAvgCtr, avgRoas: recentAvgRoas },
      prediction: {
        ctr7d: predictedCtr,
        roas7d: predictedRoas,
        ctrTrend: ctrMomentum > 0 ? 'improving' : ctrMomentum < 0 ? 'declining' : 'stable',
        roasTrend: roasMomentum > 0 ? 'improving' : roasMomentum < 0 ? 'declining' : 'stable',
      },
      historicalDataPoints: recentData.length,
    };
  }
}
