import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmOutbound } from '../llm.js';

/**
 * Campaign Scorer Handler
 *
 * Analyzes outbound campaign performance and suggests optimizations.
 *
 * Ported from: ai-marketing-skills outbound/SKILL.md
 */
export class CampaignScorerHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { campaignData = {}, benchmarks = {} } = input;

    const prompt = `You are an outbound performance analyst. Score this campaign.

CAMPAIGN DATA:
${JSON.stringify(campaignData, null, 2)}

INDUSTRY BENCHMARKS:
${JSON.stringify(benchmarks)}

Return JSON:
{
  "overallScore": number,
  "metrics": {
    "deliverability": { "rate": number, "score": number, "issues": string[] },
    "openRate": { "rate": number, "score": number, "vsBeanchmark": number },
    "replyRate": { "rate": number, "score": number, "vsBenchmark": number },
    "positiveReplyRate": { "rate": number, "score": number },
    "meetingRate": { "rate": number, "score": number }
  },
  "stepAnalysis": [
    {
      "step": number,
      "openRate": number,
      "replyRate": number,
      "dropoff": number,
      "recommendation": string
    }
  ],
  "optimizations": [
    {
      "area": string,
      "current": string,
      "recommended": string,
      "expectedLift": string,
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

    const raw = await llmOutbound(prompt);
    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'outbound',
      type: 'outbound.campaign_scored',
      data: { score: result.overallScore, optimizations: result.optimizations?.length || 0 },
    });

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'campaign_score',
          category: 'analysis',
          reasoning: `Campaign scored ${result.overallScore || 0}/100. ${result.optimizations?.length || 0} optimizations suggested.`,
          trigger: { taskType: 'campaign_score' },
          afterState: { score: result.overallScore },
          confidence: 0.85,
          impactMetric: 'campaign_score',
          impactDelta: result.overallScore || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log campaign score:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { scoring: result, completedAt: new Date().toISOString() };
  }
}
