import type { Job } from 'bullmq';
import { withTenantDb, campaigns, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmAnalyze } from '../llm.js';
import { eq, and } from 'drizzle-orm';

export class CampaignManager {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { campaignId, action } = input;

    const campaign = await withTenantDb(tenantId, async (db) => {
      const [c] = await db.select().from(campaigns)
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)))
        .limit(1);
      return c;
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    await job.updateProgress(40);

    const prompt = `Analyze campaign "${campaign.name}" and suggest management actions:
Type: ${campaign.type}
Status: ${campaign.status}
Platform: ${campaign.platform}
Metrics: impressions=${campaign.impressions}, clicks=${campaign.clicks}, CTR=${campaign.ctr}, spend=${campaign.spend}, ROAS=${campaign.roas}
Requested Action: ${action || 'optimize'}

Return JSON: { recommendations: [{action, rationale, expectedImpact}], statusRecommendation: string, riskLevel: "low" | "medium" | "high" }`;

    const analysis = await llmAnalyze(prompt);

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'campaign_management',
          category: 'analysis',
          reasoning: `Campaign management analysis for "${campaign.name}" (${campaign.type}/${campaign.platform}). Action: ${action || 'optimize'}.`,
          trigger: { taskType: 'campaign_management', campaignId, action },
          beforeState: { status: campaign.status, spend: campaign.spend, roas: campaign.roas },
          confidence: 0.75,
          impactMetric: 'campaign_health',
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);

    try {
      return JSON.parse(analysis.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return { raw: analysis };
    }
  }

  async syncKeywords(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    const { keywordGaps, source } = input;

    const prompt = `New keyword opportunities from SEO audit need to be synced to ad campaigns:
Keywords: ${JSON.stringify(keywordGaps)}
Source: ${source}

For each keyword, determine:
1. Should it be added to paid search campaigns?
2. Estimated CPC and competition level
3. Recommended match type (exact, phrase, broad)
4. Recommended ad group

Return JSON: { keywordActions: [{keyword, addToPaidSearch: boolean, estimatedCpc, matchType, adGroup, rationale}] }`;

    const analysis = await llmAnalyze(prompt);
    try {
      return JSON.parse(analysis.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return { raw: analysis };
    }
  }
}
