import type { Job } from 'bullmq';
import { withTenantDb, agentActions, salesCallInsights } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmLongFormSales } from '../llm.js';

/**
 * Call Analyzer Handler
 *
 * Analyzes sales call transcripts: sentiment, objection detection,
 * competitive mentions, next steps, coaching opportunities.
 *
 * Ported from: ai-marketing-skills sales-pipeline/SKILL.md
 */
export class CallAnalyzerHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { transcript, dealId, rep, callType = 'discovery' } = input;

    const prompt = `You are a sales coaching AI. Analyze this sales call transcript.

CALL TYPE: ${callType}
REP: ${rep || 'unknown'}

TRANSCRIPT (first 6000 chars):
${(transcript || '').slice(0, 6000)}

Return JSON:
{
  "summary": string,
  "sentiment": {
    "overall": "positive" | "neutral" | "negative",
    "prospectEngagement": number,
    "repConfidence": number,
    "buyingSignals": string[],
    "redFlags": string[]
  },
  "objections": [
    {
      "objection": string,
      "handled": boolean,
      "handlingQuality": "excellent" | "good" | "poor",
      "betterResponse": string | null
    }
  ],
  "competitorMentions": [
    { "competitor": string, "context": string, "sentiment": "positive" | "neutral" | "negative" }
  ],
  "nextSteps": {
    "agreedupon": string[],
    "suggested": string[],
    "timeline": string
  },
  "coaching": {
    "strengths": string[],
    "improvements": string[],
    "talkListenRatio": string,
    "questionQuality": "high" | "medium" | "low",
    "closingAttempt": boolean
  },
  "dealImpact": {
    "probabilityChange": number,
    "stageRecommendation": string,
    "riskLevel": "low" | "medium" | "high"
  }
}`;

    const raw = await llmLongFormSales(prompt);
    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(salesCallInsights).values({
          tenantId,
          dealRef: dealId || null,
          callType,
          sentiment: result.sentiment?.overall || 'neutral',
          objections: result.objections || [],
          nextSteps: result.nextSteps || {},
          coaching: result.coaching || {},
          metadata: { competitorMentions: result.competitorMentions, dealImpact: result.dealImpact },
        });

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'call_analysis',
          category: 'coaching',
          reasoning: `Call analysis: ${result.sentiment?.overall || 'unknown'} sentiment, ${result.objections?.length || 0} objections, ${result.coaching?.improvements?.length || 0} coaching points.`,
          trigger: { taskType: 'call_analysis' },
          afterState: { sentiment: result.sentiment?.overall, objections: result.objections?.length || 0 },
          confidence: 0.8,
          impactMetric: 'calls_analyzed',
          impactDelta: 1,
        });
      });
    } catch (e) {
      console.warn('Failed to store call insights:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { callAnalysis: result, completedAt: new Date().toISOString() };
  }
}
