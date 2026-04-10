import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmFinance } from '../llm.js';

/**
 * Cost Estimate Handler
 *
 * Estimates campaign costs, channel budgets, and resource allocation.
 * Flags anomalies when actual spend deviates from estimates.
 *
 * Ported from: ai-marketing-skills/finance
 */
export class CostEstimateHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      campaigns = [],
      channels = [],
      historicalSpend = [],
      budget = {},
      timeframeWeeks = 4,
    } = input;

    // Deterministic anomaly detection on historical data
    const anomalies: any[] = [];
    for (const item of historicalSpend) {
      if (item.budget && item.actual) {
        const variance = ((item.actual - item.budget) / item.budget) * 100;
        if (Math.abs(variance) > 20) {
          anomalies.push({
            channel: item.channel || item.campaign,
            budget: item.budget,
            actual: item.actual,
            variancePercent: Math.round(variance * 10) / 10,
            type: variance > 0 ? 'overspend' : 'underspend',
          });
        }
      }
    }

    await job.updateProgress(30);

    const prompt = `You are a marketing finance analyst. Estimate costs and allocate budgets.

CAMPAIGNS: ${JSON.stringify(campaigns.slice(0, 10), null, 2)}
CHANNELS: ${JSON.stringify(channels, null, 2)}
HISTORICAL SPEND: ${JSON.stringify(historicalSpend.slice(0, 20), null, 2)}
BUDGET: ${JSON.stringify(budget, null, 2)}
TIMEFRAME: ${timeframeWeeks} weeks
DETECTED ANOMALIES: ${JSON.stringify(anomalies, null, 2)}

Return JSON:
{
  "totalEstimate": number,
  "byChannel": [
    {
      "channel": string,
      "estimated": number,
      "recommended": number,
      "expectedROAS": number,
      "confidence": "high" | "medium" | "low",
      "notes": string
    }
  ],
  "byCampaign": [
    {
      "campaign": string,
      "estimated": number,
      "breakdown": { "media": number, "creative": number, "tools": number, "labor": number }
    }
  ],
  "budgetUtilization": number,
  "savingsOpportunities": [{ "area": string, "potentialSaving": number, "recommendation": string }],
  "contingencyReserve": number
}`;

    const raw = await llmFinance(prompt);
    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    // Signal anomalies
    if (anomalies.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'finance',
        type: 'finance.anomaly_detected',
        data: { anomalies: anomalies.length, totalVariance: anomalies.reduce((sum: number, a: any) => sum + Math.abs(a.variancePercent), 0) },
      });
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'cost_estimate',
          category: 'finance',
          reasoning: `Estimated ${result.totalEstimate || 0} total cost across ${result.byChannel?.length || 0} channels. ${anomalies.length} budget anomalies detected. ${result.savingsOpportunities?.length || 0} savings opportunities.`,
          trigger: { taskType: 'cost_estimate', timeframeWeeks },
          afterState: { totalEstimate: result.totalEstimate, anomalies: anomalies.length },
          confidence: 0.75,
          impactMetric: 'cost_estimate',
          impactDelta: result.totalEstimate || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log cost estimate:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { estimate: result, anomalies, completedAt: new Date().toISOString() };
  }
}
