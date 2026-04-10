import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';

/**
 * Pacing Alert Handler
 *
 * Monitors campaign/channel pacing against goals and emits alerts
 * when metrics fall below threshold. Runs on a schedule.
 *
 * Ported from: ai-marketing-skills growth/SKILL.md
 */
export class PacingAlertHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      channels = [],
      alertThreshold = 0.7,
      criticalThreshold = 0.5,
    } = input;

    const alerts: any[] = [];
    const now = new Date();

    for (const channel of channels) {
      const { name, metrics = [] } = channel;

      for (const metric of metrics) {
        const { key, current, goal, daysElapsed, totalDays } = metric;
        if (!goal || goal === 0) continue;

        const expectedProgress = daysElapsed / totalDays;
        const actualProgress = current / goal;
        const pacing = actualProgress / expectedProgress;

        if (pacing < criticalThreshold) {
          alerts.push({
            channel: name,
            metric: key,
            severity: 'critical' as const,
            pacing: Math.round(pacing * 100),
            current,
            goal,
            expectedAtThisPoint: Math.round(goal * expectedProgress),
            deficit: Math.round(goal * expectedProgress - current),
            projectedEndOfPeriod: Math.round(current / expectedProgress),
            message: `${name}/${key} critically behind: ${Math.round(pacing * 100)}% of expected pace`,
          });
        } else if (pacing < alertThreshold) {
          alerts.push({
            channel: name,
            metric: key,
            severity: 'warning' as const,
            pacing: Math.round(pacing * 100),
            current,
            goal,
            expectedAtThisPoint: Math.round(goal * expectedProgress),
            deficit: Math.round(goal * expectedProgress - current),
            projectedEndOfPeriod: Math.round(current / expectedProgress),
            message: `${name}/${key} below pace: ${Math.round(pacing * 100)}% of expected`,
          });
        }
      }
    }

    await job.updateProgress(70);

    // Emit signals for critical alerts
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'data-nexus',
        type: 'finance.anomaly_detected',
        data: {
          anomalyType: 'pacing_critical',
          alerts: criticalAlerts,
        },
      });
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'pacing_alert',
          category: 'monitoring',
          reasoning: `Pacing check: ${alerts.length} alerts (${criticalAlerts.length} critical) across ${channels.length} channels.`,
          trigger: { taskType: 'pacing_alert' },
          afterState: { alertCount: alerts.length, criticalCount: criticalAlerts.length },
          confidence: 0.95,
          impactMetric: 'pacing_alerts',
          impactDelta: alerts.length,
        });
      });
    } catch (e) {
      console.warn('Failed to log pacing alert:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { alerts, summary: { total: alerts.length, critical: criticalAlerts.length }, completedAt: new Date().toISOString() };
  }
}
