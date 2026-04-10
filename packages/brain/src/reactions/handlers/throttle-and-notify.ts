import { createLogger } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import type { ReactionConfig, ReactionEvent } from '../../types.js';

// ---------------------------------------------------------------------------
// Throttle-and-Notify Handler
//
// Budget-based throttling: when spend crosses a threshold, throttle
// low-priority tasks and send manager notification.
// ---------------------------------------------------------------------------

const logger = createLogger('brain:reaction:throttle');

export class ThrottleAndNotifyHandler {
  async handle(
    tenantId: string,
    event: ReactionEvent,
    config: ReactionConfig,
  ): Promise<void> {
    const budgetInfo = event.context as {
      currentSpend?: number;
      budgetLimit?: number;
      usedPercent?: number;
    };

    const threshold = config.budgetThresholdPercent
      ?? (config.threshold !== undefined ? (config.threshold <= 1 ? config.threshold * 100 : config.threshold) : 80);
    const usedPercent = budgetInfo.usedPercent ?? 0;

    if (usedPercent < threshold) {
      logger.debug('Budget below threshold — no action needed', { tenantId, usedPercent, threshold });
      return;
    }

    // Apply throttling
    await this.applyThrottle(tenantId, usedPercent);

    // Send notification
    await this.notify(tenantId, usedPercent, budgetInfo.currentSpend ?? 0, budgetInfo.budgetLimit ?? 0);

    logger.info('Budget throttle applied and notification sent', {
      tenantId,
      usedPercent,
      threshold,
    });
  }

  private async applyThrottle(tenantId: string, usedPercent: number): Promise<void> {
    const redis = getRedisConnection();

    // Determine throttle level based on budget usage
    let throttleLevel: 'light' | 'moderate' | 'aggressive';
    if (usedPercent >= 95) {
      throttleLevel = 'aggressive';
    } else if (usedPercent >= 90) {
      throttleLevel = 'moderate';
    } else {
      throttleLevel = 'light';
    }

    const throttleConfig = {
      level: throttleLevel,
      appliedAt: new Date().toISOString(),
      usedPercent,
      rules: this.getThrottleRules(throttleLevel),
    };

    await redis.setex(
      `brain:throttle:${tenantId}`,
      3_600, // 1 hour TTL — re-evaluated on next tick
      JSON.stringify(throttleConfig),
    );
  }

  private getThrottleRules(level: 'light' | 'moderate' | 'aggressive'): Record<string, unknown> {
    switch (level) {
      case 'light':
        return {
          skipNonEssentialTasks: true,
          preferCheaperModels: true,
          maxConcurrentTasks: 5,
        };
      case 'moderate':
        return {
          skipNonEssentialTasks: true,
          preferCheaperModels: true,
          maxConcurrentTasks: 3,
          pauseAgentTypes: ['creative', 'podcast'],
        };
      case 'aggressive':
        return {
          skipNonEssentialTasks: true,
          preferCheaperModels: true,
          maxConcurrentTasks: 1,
          pauseAgentTypes: ['creative', 'podcast', 'social', 'reddit'],
          onlyAllowTaskTypes: ['seo_audit', 'data_daily_digest', 'health_check'],
        };
    }
  }

  private async notify(
    tenantId: string,
    usedPercent: number,
    currentSpend: number,
    budgetLimit: number,
  ): Promise<void> {
    const redis = getRedisConnection();
    const notificationKey = `brain:notifications:${tenantId}`;

    await redis.rpush(notificationKey, JSON.stringify({
      type: 'budget-alert',
      severity: usedPercent >= 95 ? 'critical' : usedPercent >= 90 ? 'high' : 'medium',
      message: `Budget usage at ${usedPercent.toFixed(0)}%: $${currentSpend.toFixed(2)} of $${budgetLimit.toFixed(2)}`,
      timestamp: new Date().toISOString(),
    }));
    await redis.expire(notificationKey, 604_800); // 7 days
  }
}
