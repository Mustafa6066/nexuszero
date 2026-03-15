import type { Job } from 'bullmq';
import { linearRegression } from '@nexuszero/shared';
import { getDb, withTenantDb, forecasts, agentActions } from '@nexuszero/db';
import { queryMetricHistory } from '../clickhouse-client.js';
import { llmForecastAnalysis } from '../llm.js';
import { publishAgentSignal } from '@nexuszero/queue';

const FORECAST_METRICS = ['daily_spend', 'daily_revenue', 'daily_roas', 'daily_ctr', 'daily_conversions'];
const FORECAST_HORIZON_DAYS = 14;

export class ForecastingHandler {
  async execute(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;
    const metrics = (input.metrics as string[]) || FORECAST_METRICS;
    const horizonDays = (input.horizonDays as number) || FORECAST_HORIZON_DAYS;

    const results: Array<{
      metric: string;
      forecasts: Array<{ date: string; predicted: number; lower: number; upper: number }>;
      trend: { slope: number; rSquared: number };
      narrative: string;
    }> = [];

    for (const metric of metrics) {
      // 1. Get historical data
      const history = await queryMetricHistory(tenantId, metric, 90);
      if (history.length < 14) continue;

      const values = history.map(h => h.value);
      const xValues = values.map((_, i) => i);

      // 2. Linear regression for trend
      const regression = linearRegression(xValues, values);

      // 3. Compute residual standard deviation for confidence interval
      const residuals = values.map((v, i) => v - (regression.slope * i + regression.intercept));
      const residualMean = residuals.reduce((s, r) => s + r, 0) / residuals.length;
      const residualStd = Math.sqrt(
        residuals.reduce((s, r) => s + (r - residualMean) ** 2, 0) / residuals.length
      );

      // 4. Generate forecasts
      const forecastPoints: Array<{ date: string; predicted: number; lower: number; upper: number }> = [];
      const lastDate = new Date(history[history.length - 1]!.date);

      for (let d = 1; d <= horizonDays; d++) {
        const forecastDate = new Date(lastDate);
        forecastDate.setDate(forecastDate.getDate() + d);

        const xForecast = values.length + d - 1;
        const predicted = regression.slope * xForecast + regression.intercept;
        // 95% confidence interval widens with distance
        const margin = 1.96 * residualStd * Math.sqrt(1 + 1 / values.length + (d * d) / (values.length * values.length));
        const lower = Math.max(0, predicted - margin);
        const upper = predicted + margin;

        forecastPoints.push({
          date: forecastDate.toISOString().split('T')[0]!,
          predicted: Math.max(0, predicted),
          lower,
          upper,
        });
      }

      // 5. LLM narrative analysis
      const analysis = await llmForecastAnalysis({
        metric,
        dataPoints: history.slice(-30),
        trendSlope: regression.slope,
        rSquared: regression.rSquared,
      });

      // 6. Store forecasts in Postgres
      const confidence = Math.min(0.95, regression.rSquared);
      await withTenantDb(tenantId, async (tDb) => {
        for (const fp of forecastPoints) {
          await tDb.insert(forecasts).values({
            tenantId,
            metric,
            forecastDate: new Date(fp.date),
            predictedValue: fp.predicted,
            lowerBound: fp.lower,
            upperBound: fp.upper,
            confidence,
            model: 'linear_regression',
          });
        }
      });

      results.push({
        metric,
        forecasts: forecastPoints,
        trend: { slope: regression.slope, rSquared: regression.rSquared },
        narrative: analysis.narrative,
      });
    }

    // 7. Signal forecast update
    await publishAgentSignal({
      tenantId,
      type: 'data.forecast_updated',
      sourceAgent: 'data_nexus',
      targetAgent: 'broadcast',
      payload: {
        metricsForecasted: results.map(r => r.metric),
        horizonDays,
        averageConfidence: results.reduce((s, r) => s + r.trend.rSquared, 0) / Math.max(results.length, 1),
      },
      priority: 'low',
      confidence: 0.8,
      correlationId: job.data.correlationId as string,
    });

    // Log agent action
    try {
      const avgConf = results.reduce((s, r) => s + r.trend.rSquared, 0) / Math.max(results.length, 1);
      await withTenantDb(tenantId, async (tDb) => {
        await tDb.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'forecasting',
          category: 'analysis',
          reasoning: `Generated ${horizonDays}-day forecasts for ${results.length} metrics. Average model confidence: ${(avgConf * 100).toFixed(0)}%.`,
          trigger: { taskType: 'forecasting', metrics: results.map(r => r.metric), horizonDays },
          afterState: { metricsForecasted: results.length, avgConfidence: avgConf },
          confidence: avgConf,
          impactMetric: 'forecast_accuracy',
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    return {
      metricsForecasted: results.length,
      horizonDays,
      results,
    };
  }
}
