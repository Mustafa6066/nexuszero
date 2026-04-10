import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmFinanceLongForm } from '../llm.js';

/**
 * CFO Briefing Handler
 *
 * Generates executive-level financial briefings:
 * - Revenue/cost/margin summaries with period-over-period trends
 * - Cash flow position and runway estimates
 * - Key financial risks and mitigation strategies
 * - Board-ready narrative with supporting metrics
 *
 * Ported from: ai-marketing-skills/finance
 */
export class CfoBriefingHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      period = 'monthly',
      revenue = {},
      costs = {},
      cashPosition = {},
      channelMetrics = [],
      previousBriefing = null,
    } = input;

    const prompt = `Generate a CFO-level financial briefing.

PERIOD: ${period}
REVENUE DATA: ${JSON.stringify(revenue, null, 2)}
COST DATA: ${JSON.stringify(costs, null, 2)}
CASH POSITION: ${JSON.stringify(cashPosition, null, 2)}
CHANNEL METRICS: ${JSON.stringify(channelMetrics.slice(0, 10), null, 2)}
${previousBriefing ? `PREVIOUS BRIEFING SUMMARY: ${JSON.stringify(previousBriefing)}` : ''}

Return JSON:
{
  "executiveSummary": string,
  "keyMetrics": [
    {
      "metric": string,
      "current": number,
      "previous": number,
      "changePercent": number,
      "trend": "up" | "down" | "flat",
      "status": "green" | "yellow" | "red"
    }
  ],
  "revenueAnalysis": {
    "total": number,
    "byChannel": [{ "channel": string, "revenue": number, "margin": number, "trend": string }],
    "topLineNarrative": string
  },
  "costAnalysis": {
    "total": number,
    "byCategory": [{ "category": string, "amount": number, "budgetVariance": number }],
    "overruns": string[]
  },
  "cashFlow": {
    "position": number,
    "burnRate": number,
    "runway": string,
    "projectedPosition30d": number
  },
  "risks": [
    { "risk": string, "severity": "high" | "medium" | "low", "mitigation": string }
  ],
  "recommendations": [
    { "action": string, "expectedImpact": string, "priority": 1 | 2 | 3 }
  ],
  "boardTalkingPoints": string[]
}`;

    const raw = await llmFinanceLongForm(prompt);
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
          actionType: 'cfo_briefing',
          category: 'finance',
          reasoning: `Generated ${period} CFO briefing. ${result.risks?.filter((r: any) => r.severity === 'high').length || 0} high-severity risks. Runway: ${result.cashFlow?.runway || 'N/A'}.`,
          trigger: { taskType: 'cfo_briefing', period },
          afterState: { metricsCount: result.keyMetrics?.length || 0, risksCount: result.risks?.length || 0 },
          confidence: 0.8,
          impactMetric: 'cfo_briefing',
          impactDelta: 1,
        });
      });
    } catch (e) {
      console.warn('Failed to log CFO briefing:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { briefing: result, completedAt: new Date().toISOString() };
  }
}
