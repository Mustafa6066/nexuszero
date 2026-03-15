import type { Job } from 'bullmq';
import { withTenantDb, campaigns, agentActions } from '@nexuszero/db';
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

    // Log agent action for explainability
    const applied = optimization.expectedImpact?.roasChange > 0.1;
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'optimize_bids',
          category: applied ? 'optimization' : 'analysis',
          reasoning: `Bid optimization for campaign "${campaign.name}". ${applied ? 'Applied budget change.' : 'No change applied — insufficient ROAS impact.'} Expected ROAS change: ${optimization.expectedImpact?.roasChange?.toFixed(2) || 'N/A'}.`,
          trigger: { taskType: 'optimize_bids', campaignId },
          beforeState: { budget: campaign.budget, spend: campaign.spend, roas: campaign.roas },
          afterState: { budgetRecommendation: optimization.budgetRecommendation, applied },
          confidence: Math.min(1, Math.abs(optimization.expectedImpact?.roasChange || 0)),
          impactMetric: 'roas',
          impactDelta: optimization.expectedImpact?.roasChange || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);

    return {
      campaignId,
      optimization,
      applied,
      completedAt: new Date().toISOString(),
    };
  }
}
