import { createLogger } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import type { ReactionConfig, ReactionEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Escalation Manager
//
// Time-based escalation: if a reaction doesn't resolve within escalateAfter,
// escalate to next handler or human approval queue.
// ---------------------------------------------------------------------------

const logger = createLogger('brain:escalation');

export class EscalationManager {
  /** Schedule an escalation timer for a reaction */
  async scheduleEscalation(
    tenantId: string,
    event: ReactionEvent,
    config: ReactionConfig,
  ): Promise<void> {
    if (!config.escalateAfterMs) return;

    const redis = getRedisConnection();
    const escalationId = `${tenantId}:${event.trigger}:${Date.now()}`;
    const key = `brain:escalation:${escalationId}`;

    await redis.setex(key, Math.ceil(config.escalateAfterMs / 1000), JSON.stringify({
      tenantId,
      event,
      config,
      scheduledAt: new Date().toISOString(),
      escalateAt: new Date(Date.now() + config.escalateAfterMs).toISOString(),
    }));

    // Also store in a sorted set for efficient polling
    const zsetKey = `brain:escalation-queue:${tenantId}`;
    await redis.zadd(zsetKey, Date.now() + config.escalateAfterMs, escalationId);
    await redis.expire(zsetKey, 86_400);

    logger.info('Escalation scheduled', {
      tenantId,
      trigger: event.trigger,
      escalateAfterMs: config.escalateAfterMs,
    });
  }

  /** Check for any escalations that are due */
  async checkDueEscalations(tenantId: string): Promise<void> {
    const redis = getRedisConnection();
    const zsetKey = `brain:escalation-queue:${tenantId}`;
    const now = Date.now();

    // Get all due escalations
    const dueIds = await redis.zrangebyscore(zsetKey, 0, now);

    for (const escalationId of dueIds) {
      const key = `brain:escalation:${escalationId}`;
      const data = await redis.get(key);

      if (data) {
        try {
          const escalation = JSON.parse(data) as {
            tenantId: string;
            event: ReactionEvent;
            config: ReactionConfig;
          };

          await this.escalate(escalation.tenantId, escalation.event);
        } catch (err) {
          logger.error('Failed to process escalation', { err, escalationId });
        }
      }

      // Remove from queue regardless
      await redis.zrem(zsetKey, escalationId);
      await redis.del(key);
    }
  }

  /** Escalate an event to human approval */
  async handle(
    tenantId: string,
    event: ReactionEvent,
    _config: ReactionConfig,
  ): Promise<void> {
    await this.escalate(tenantId, event);
  }

  private async escalate(tenantId: string, event: ReactionEvent): Promise<void> {
    const redis = getRedisConnection();
    const approvalKey = `brain:approvals:${tenantId}`;

    await redis.rpush(approvalKey, JSON.stringify({
      type: 'escalation',
      event,
      escalatedAt: new Date().toISOString(),
      urgency: 'high',
    }));
    await redis.expire(approvalKey, 86_400);

    logger.warn('Reaction escalated to human approval', { tenantId, trigger: event.trigger });
  }
}
