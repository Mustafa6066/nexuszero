import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmAnalyzeSales } from '../llm.js';

/**
 * Win/Loss Analyzer Handler
 *
 * Analyzes patterns in won and lost deals to surface systemic
 * factors affecting close rates.
 *
 * Ported from: ai-marketing-skills sales-pipeline/SKILL.md
 */
export class WinLossAnalyzerHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { wonDeals = [], lostDeals = [], period } = input;

    const prompt = `You are a sales analytics expert. Perform win/loss analysis.

WON DEALS (${wonDeals.length}):
${JSON.stringify(wonDeals.slice(0, 25), null, 2)}

LOST DEALS (${lostDeals.length}):
${JSON.stringify(lostDeals.slice(0, 25), null, 2)}

PERIOD: ${period || 'last quarter'}

Return JSON:
{
  "winRate": number,
  "winPatterns": [
    { "pattern": string, "frequency": number, "impact": "high" | "medium" | "low" }
  ],
  "lossPatterns": [
    { "pattern": string, "frequency": number, "lossReason": string, "preventable": boolean }
  ],
  "competitiveLosses": [
    { "competitor": string, "lossCount": number, "commonThemes": string[] }
  ],
  "segmentAnalysis": [
    { "segment": string, "winRate": number, "avgDealSize": number, "avgCycle": number }
  ],
  "recommendations": [
    { "action": string, "expectedImpact": string, "priority": "high" | "medium" | "low" }
  ],
  "keyMetrics": {
    "avgWonDealSize": number,
    "avgLostDealSize": number,
    "avgWinCycle": number,
    "avgLossCycle": number,
    "topLossReasons": string[]
  }
}`;

    const raw = await llmAnalyzeSales(prompt);
    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'win_loss_analysis',
          category: 'analysis',
          reasoning: `Win/loss: ${result.winRate || 0}% win rate. ${result.winPatterns?.length || 0} win patterns, ${result.lossPatterns?.length || 0} loss patterns.`,
          trigger: { taskType: 'win_loss_analysis' },
          afterState: { winRate: result.winRate, recommendations: result.recommendations?.length || 0 },
          confidence: 0.8,
          impactMetric: 'win_rate',
          impactDelta: result.winRate || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log win/loss:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { analysis: result, completedAt: new Date().toISOString() };
  }
}
