import type { Job } from 'bullmq';
import { withTenantDb, campaigns } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmOptimizeBids } from '../llm.js';
import { eq, and } from 'drizzle-orm';

export class BidOptimizer {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { campaignId } = input;

    // Get campaign data
    const campaign = await withTenantDb(tenantId, async (db) => {
      const [c] = await db.select().from(campaigns)
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)))
        .limit(1);
      return c;
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    await job.updateProgress(30);

    const optimization = await llmOptimizeBids({
      budget: campaign.budget,
      currentMetrics: {
        impressions: campaign.impressions,
        clicks: campaign.clicks,
        conversions: campaign.conversions,
        spend: campaign.spend,
        revenue: campaign.revenue,
        ctr: campaign.ctr,
        cpc: campaign.cpc,
        roas: campaign.roas,
      },
      historicalData: [],
      bidStrategy: (campaign.config as any)?.bidStrategy || 'maximize_conversions',
    });

    await job.updateProgress(80);

    // Apply recommended budget if significant improvement expected
    if (optimization.budgetRecommendation && optimization.expectedImpact?.roasChange > 0.1) {
      await withTenantDb(tenantId, async (db) => {
        await db.update(campaigns)
          .set({
            budget: { ...(campaign.budget as any), daily: optimization.budgetRecommendation.daily },
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, campaignId));
      });
    }

    await job.updateProgress(100);

    return {
      campaignId,
      optimization,
      applied: optimization.expectedImpact?.roasChange > 0.1,
      completedAt: new Date().toISOString(),
    };
  }
}
