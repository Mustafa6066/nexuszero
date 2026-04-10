import type { Job } from 'bullmq';
import { withTenantDb, agentActions, dealRecords } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmAnalyzeSales } from '../llm.js';

/**
 * Deal Resurrector Handler
 *
 * Identifies closed-lost deals with resurrection potential,
 * generates re-engagement sequences with personalized angles.
 *
 * Ported from: ai-marketing-skills sales-pipeline/SKILL.md
 */
export class DealResurrectorHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { closedDeals = [], minAgeDays = 30, maxAgeDays = 180 } = input;

    const prompt = `You are a win-back strategist. Identify deals worth resurrecting.

CLOSED-LOST DEALS (aged ${minAgeDays}-${maxAgeDays} days):
${JSON.stringify(closedDeals.slice(0, 30), null, 2)}

Return JSON:
{
  "resurrectionCandidates": [
    {
      "dealId": string,
      "company": string,
      "originalValue": number,
      "lostReason": string,
      "resurrectionScore": number,
      "triggers": string[],
      "reEngagementStrategy": {
        "angle": string,
        "openingMessage": string,
        "valueProposition": string,
        "timing": string
      },
      "sequence": [
        { "day": number, "channel": string, "message": string }
      ]
    }
  ],
  "summary": {
    "totalReviewed": number,
    "worthResurrecting": number,
    "totalPipelineValue": number,
    "topTriggers": string[]
  }
}

Resurrection scoring:
- Lost reason timing (product gap now fixed, budget cycle reset): +30
- Champion still at company: +25
- Recent company events (funding, exec hire): +20
- Original deal size: +15
- Engagement since loss: +10`;

    const raw = await llmAnalyzeSales(prompt);
    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        for (const candidate of (result.resurrectionCandidates || []).slice(0, 20)) {
          await db.insert(dealRecords).values({
            tenantId,
            dealRef: candidate.dealId,
            stage: 'resurrected',
            value: candidate.originalValue || 0,
            metadata: {
              resurrectionScore: candidate.resurrectionScore,
              triggers: candidate.triggers,
              strategy: candidate.reEngagementStrategy,
            },
          });
        }

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'deal_resurrection',
          category: 'pipeline',
          reasoning: `Reviewed ${result.summary?.totalReviewed || 0} closed deals. ${result.summary?.worthResurrecting || 0} worth resurrecting, $${result.summary?.totalPipelineValue || 0} potential pipeline.`,
          trigger: { taskType: 'deal_resurrection' },
          afterState: result.summary || {},
          confidence: 0.7,
          impactMetric: 'resurrected_pipeline',
          impactDelta: result.summary?.totalPipelineValue || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to store resurrected deals:', (e as Error).message);
    }

    if ((result.resurrectionCandidates || []).length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'sales-pipeline',
        type: 'sales.deal_resurrected',
        data: { count: result.resurrectionCandidates.length, totalValue: result.summary?.totalPipelineValue },
      });
    }

    await job.updateProgress(100);
    return { resurrections: result, completedAt: new Date().toISOString() };
  }
}
