import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmFinanceLongForm } from '../llm.js';

/**
 * Scenario Model Handler
 *
 * Financial scenario modeling for strategic decisions:
 * - Base / optimistic / pessimistic projections
 * - Sensitivity analysis on key variables
 * - Monte Carlo-style confidence intervals
 * - Decision matrix with risk-adjusted outcomes
 *
 * Ported from: ai-marketing-skills/finance
 */
export class ScenarioModelHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      question,
      variables = [],
      constraints = [],
      currentMetrics = {},
      horizonMonths = 12,
    } = input;

    // Build deterministic sensitivity ranges
    const sensitivities = variables.map((v: any) => ({
      name: v.name,
      base: v.value,
      low: v.value * (1 - (v.variancePercent || 20) / 100),
      high: v.value * (1 + (v.variancePercent || 20) / 100),
    }));

    await job.updateProgress(20);

    const prompt = `You are a financial modeling expert. Build scenario projections for this strategic question.

QUESTION: ${question}
VARIABLES: ${JSON.stringify(sensitivities, null, 2)}
CONSTRAINTS: ${JSON.stringify(constraints, null, 2)}
CURRENT METRICS: ${JSON.stringify(currentMetrics, null, 2)}
HORIZON: ${horizonMonths} months

Return JSON:
{
  "scenarios": [
    {
      "name": "base" | "optimistic" | "pessimistic",
      "probability": number,
      "assumptions": string[],
      "projections": {
        "revenue": number[],
        "costs": number[],
        "profit": number[],
        "months": string[]
      },
      "keyMetrics": {
        "totalRevenue": number,
        "totalProfit": number,
        "roi": number,
        "breakEvenMonth": number | null,
        "peakCashNeed": number
      }
    }
  ],
  "sensitivityAnalysis": [
    {
      "variable": string,
      "impactOnProfit": { "low": number, "high": number },
      "elasticity": number,
      "criticalThreshold": number | null
    }
  ],
  "decisionMatrix": [
    {
      "option": string,
      "expectedValue": number,
      "riskAdjustedValue": number,
      "downside": number,
      "upside": number,
      "recommendation": string
    }
  ],
  "recommendation": string,
  "keyAssumptions": string[],
  "riskFactors": string[]
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
          actionType: 'scenario_model',
          category: 'finance',
          reasoning: `Modeled ${result.scenarios?.length || 0} scenarios over ${horizonMonths}mo for: "${question}". ${result.sensitivityAnalysis?.length || 0} variables analyzed.`,
          trigger: { taskType: 'scenario_model', question },
          afterState: { scenarios: result.scenarios?.length || 0, horizon: horizonMonths },
          confidence: 0.7,
          impactMetric: 'scenario_model',
          impactDelta: 1,
        });
      });
    } catch (e) {
      console.warn('Failed to log scenario model:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { model: result, sensitivities, completedAt: new Date().toISOString() };
  }
}
