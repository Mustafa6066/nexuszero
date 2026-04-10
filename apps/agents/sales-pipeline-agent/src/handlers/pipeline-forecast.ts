import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmLongFormSales } from '../llm.js';

/**
 * Pipeline Forecaster Handler
 *
 * AI-powered pipeline forecasting: weighted pipeline, deal velocity,
 * stage conversion rates, risk scoring, call adjustments.
 *
 * Ported from: ai-marketing-skills sales-pipeline/SKILL.md
 */
export class PipelineForecastHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { deals = [], historicalRates = {}, target, period } = input;

    const prompt = `You are a revenue forecasting analyst. Generate pipeline forecast.

OPEN DEALS:
${JSON.stringify(deals.slice(0, 50), null, 2)}

HISTORICAL STAGE CONVERSION RATES:
${JSON.stringify(historicalRates)}

TARGET: $${target || 'unknown'}
PERIOD: ${period || 'this quarter'}

Return JSON:
{
  "forecast": {
    "weighted": number,
    "bestCase": number,
    "worstCase": number,
    "expected": number,
    "targetGap": number,
    "coverageRatio": number
  },
  "byStage": [
    {
      "stage": string,
      "dealCount": number,
      "totalValue": number,
      "avgConversion": number,
      "weightedValue": number,
      "avgDaysInStage": number,
      "stuckDeals": number
    }
  ],
  "riskDeals": [
    {
      "dealId": string,
      "company": string,
      "value": number,
      "stage": string,
      "riskScore": number,
      "riskFactors": string[],
      "recommendation": string
    }
  ],
  "velocity": {
    "avgCycleLength": number,
    "medianCycleLength": number,
    "avgDealSize": number,
    "winRate": number,
    "salesVelocity": number
  },
  "recommendations": [string]
}

Sales velocity = (# opportunities × avg deal size × win rate) / avg cycle length`;

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
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'pipeline_forecast',
          category: 'forecasting',
          reasoning: `Forecast: weighted=$${result.forecast?.weighted || 0}, expected=$${result.forecast?.expected || 0}, coverage=${result.forecast?.coverageRatio || 0}x. ${result.riskDeals?.length || 0} at-risk deals.`,
          trigger: { taskType: 'pipeline_forecast' },
          afterState: { forecast: result.forecast, riskCount: result.riskDeals?.length || 0 },
          confidence: 0.75,
          impactMetric: 'forecast_accuracy',
          impactDelta: result.forecast?.expected || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log pipeline forecast:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { forecast: result, completedAt: new Date().toISOString() };
  }
}
