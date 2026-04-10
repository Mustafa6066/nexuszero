import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmAnalyze } from '../llm.js';

/**
 * GSC Optimizer Handler
 *
 * Identifies striking-distance keywords (positions 4-20),
 * CTR underperformers, and cannibalization clusters from
 * Google Search Console data.
 *
 * Ported from: ai-marketing-skills seo-ops/SKILL.md
 */
export class GscOptimizerHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const prompt = `You are an expert SEO analyst specializing in Google Search Console optimization.

INPUT DATA (GSC queries & pages):
${JSON.stringify(input)}

Perform three analyses and return JSON:

{
  "strikingDistance": [
    {
      "query": string,
      "page": string,
      "position": number,
      "impressions": number,
      "clicks": number,
      "ctr": number,
      "expectedCtrAtPosition": number,
      "ctrGap": number,
      "action": string,
      "priority": "critical" | "high" | "medium"
    }
  ],
  "ctrUnderperformers": [
    {
      "query": string,
      "page": string,
      "position": number,
      "actualCtr": number,
      "benchmarkCtr": number,
      "ctrDeficit": number,
      "titleSuggestion": string,
      "metaDescriptionSuggestion": string
    }
  ],
  "cannibalization": [
    {
      "query": string,
      "pages": [{"url": string, "position": number, "impressions": number}],
      "recommendation": string,
      "consolidationTarget": string
    }
  ],
  "quickWins": [
    {
      "query": string,
      "page": string,
      "currentPosition": number,
      "estimatedTrafficGain": number,
      "action": string,
      "effort": "low" | "medium" | "high"
    }
  ]
}

Rules:
- Striking distance: position >= 4 AND position <= 20 AND impressions > 50
- CTR benchmarks: pos1=31.7%, pos2=24.7%, pos3=18.7%, pos4-10 scale linearly from 13% to 3%
- CTR underperformer: actualCtr < benchmarkCtr * 0.6
- Cannibalization: 2+ pages ranking for same query within positions 1-50
- Quick wins: striking distance + low effort (existing content, just needs optimization)
- Sort each array by estimated impact descending`;

    const analysis = await llmAnalyze(prompt);
    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(analysis.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      result = { raw: analysis };
    }

    if (result.quickWins?.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'seo-worker',
        type: 'seo_keywords_updated',
        data: {
          keywordGaps: result.quickWins.map((w: any) => w.query),
          source: 'gsc_optimization',
        },
      });
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'gsc_optimization',
          category: 'analysis',
          reasoning: `Found ${result.strikingDistance?.length || 0} striking-distance keywords, ${result.ctrUnderperformers?.length || 0} CTR underperformers, ${result.cannibalization?.length || 0} cannibalization clusters.`,
          trigger: { taskType: 'gsc_optimization' },
          afterState: {
            strikingCount: result.strikingDistance?.length || 0,
            ctrUnderperfCount: result.ctrUnderperformers?.length || 0,
            quickWinCount: result.quickWins?.length || 0,
          },
          confidence: 0.9,
          impactMetric: 'quick_wins',
          impactDelta: result.quickWins?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { gscAnalysis: result, completedAt: new Date().toISOString() };
  }
}
