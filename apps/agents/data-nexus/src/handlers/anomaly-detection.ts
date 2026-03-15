import type { Job } from 'bullmq';
import { detectAnomalies } from '@nexuszero/shared';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { queryMetricHistory, logAnomaly, insertMetricSnapshot } from '../clickhouse-client.js';
import { llmInvestigateAnomaly } from '../llm.js';
import { publishAgentSignal } from '@nexuszero/queue';

const KEY_METRICS = ['daily_spend', 'daily_revenue', 'daily_roas', 'daily_ctr', 'daily_conversions'];

export class AnomalyDetectionHandler {
  async execute(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;

    // If investigating a specific anomaly from a signal
    if (input.metric && input.value !== undefined) {
      return this.investigateSpecific(tenantId, input, job);
    }

    // Otherwise, scan all key metrics
    return this.scanAllMetrics(tenantId, job);
  }

  private async investigateSpecific(
    tenantId: string,
    input: Record<string, unknown>,
    job: Job,
  ): Promise<Record<string, unknown>> {
    const metric = input.metric as string;
    const observedValue = input.value as number;
    const zScoreValue = input.zScore as number;

    // Get historical data for context
    const history = await queryMetricHistory(tenantId, metric, 30);
    const values = history.map(h => h.value);
    const mean = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

    // LLM investigation
    const investigation = await llmInvestigateAnomaly({
      metric,
      value: observedValue,
      expectedValue: mean,
      zScore: zScoreValue,
      context: {
        recentHistory: history.slice(-7),
        trend: values.length > 1 ? (values[values.length - 1]! - values[0]!) / values.length : 0,
      },
    });

    // Log to ClickHouse
    await logAnomaly(
      tenantId,
      metric,
      observedValue,
      mean,
      zScoreValue,
      investigation.severity,
      investigation.rootCause,
    );

    return {
      metric,
      observedValue,
      expectedValue: mean,
      zScore: zScoreValue,
      investigation,
    };
  }

  private async scanAllMetrics(
    tenantId: string,
    job: Job,
  ): Promise<Record<string, unknown>> {
    const allAnomalies: Array<{
      metric: string;
      anomalies: Array<{ index: number; value: number; zScore: number }>;
    }> = [];

    for (const metric of KEY_METRICS) {
      const history = await queryMetricHistory(tenantId, metric, 30);
      const values = history.map(h => h.value);

      if (values.length < 7) continue;

      const anomalies = detectAnomalies(values, 2.5);
      if (anomalies.length > 0) {
        allAnomalies.push({ metric, anomalies });

        // Investigate each anomaly that is recent (within last 2 data points)
        for (const anomaly of anomalies) {
          if (anomaly.index >= values.length - 2) {
            const mean = values.reduce((s, v) => s + v, 0) / values.length;

            const investigation = await llmInvestigateAnomaly({
              metric,
              value: anomaly.value,
              expectedValue: mean,
              zScore: anomaly.zScore,
              context: {
                recentHistory: history.slice(-7),
                allMetricAnomalies: allAnomalies.map(a => a.metric),
              },
            });

            await logAnomaly(
              tenantId,
              metric,
              anomaly.value,
              mean,
              anomaly.zScore,
              investigation.severity,
              investigation.rootCause,
            );

            // Signal if severity is high or critical
            if (investigation.severity === 'high' || investigation.severity === 'critical') {
              await publishAgentSignal({
                tenantId,
                type: 'data.anomaly_detected',
                sourceAgent: 'data_nexus',
                targetAgent: 'broadcast',
                payload: {
                  metric,
                  value: anomaly.value,
                  zScore: anomaly.zScore,
                  severity: investigation.severity,
                  rootCause: investigation.rootCause,
                  recommendation: investigation.recommendation,
                },
                priority: investigation.severity === 'critical' ? 'critical' : 'high',
                confidence: Math.min(0.95, anomaly.zScore / 5),
                correlationId: job.data.correlationId as string,
              });
            }
          }
        }
      }
    }

    // Log agent action
    const totalAnomalies = allAnomalies.reduce((sum, a) => sum + a.anomalies.length, 0);
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'anomaly_detection',
          category: totalAnomalies > 0 ? 'alert' : 'analysis',
          reasoning: `Scanned ${KEY_METRICS.length} metrics. Found ${totalAnomalies} anomalies across ${allAnomalies.length} metrics.`,
          trigger: { taskType: 'anomaly_detection', metricsScanned: KEY_METRICS },
          afterState: { metricsScanned: KEY_METRICS.length, anomaliesFound: totalAnomalies },
          confidence: 0.8,
          impactMetric: 'anomalies_detected',
          impactDelta: totalAnomalies,
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    return {
      metricsScanned: KEY_METRICS.length,
      anomaliesFound: totalAnomalies,
      details: allAnomalies,
    };
  }
}
