import { createLogger } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import { AGENT_SIGNAL_SUBSCRIPTIONS } from '@nexuszero/queue';
import type { ReactionConfig, ReactionEvent } from '../../types.js';

// ---------------------------------------------------------------------------
// Redistribute Load Handler
//
// When an agent is degraded or blocked, redistribute its pending tasks to
// capable alternative agents.
// ---------------------------------------------------------------------------

const logger = createLogger('brain:reaction:redistribute');

export class RedistributeLoadHandler {
  async handle(
    tenantId: string,
    event: ReactionEvent,
    _config: ReactionConfig,
  ): Promise<void> {
    const degradedAgent = event.sourceAgentType;
    if (!degradedAgent) {
      logger.warn('No source agent type in event — cannot redistribute', { tenantId });
      return;
    }

    const alternatives = this.findAlternatives(degradedAgent);
    if (alternatives.length === 0) {
      logger.warn('No alternative agents found for redistribution', { tenantId, degradedAgent });
      await this.notifyNoAlternatives(tenantId, degradedAgent);
      return;
    }

    const healthyAlternatives = await this.filterHealthy(tenantId, alternatives);
    if (healthyAlternatives.length === 0) {
      logger.warn('All alternative agents are also unhealthy', { tenantId, degradedAgent });
      await this.notifyNoAlternatives(tenantId, degradedAgent);
      return;
    }

    await this.redistributeTasks(tenantId, degradedAgent, healthyAlternatives);

    logger.info('Tasks redistributed to alternative agents', {
      tenantId,
      degradedAgent,
      alternatives: healthyAlternatives,
    });
  }

  /**
   * Find agents that share signal subscriptions with the degraded agent.
   * Agents with overlapping subscriptions are most likely capable alternatives.
   */
  private findAlternatives(degradedAgent: string): string[] {
    const degradedSubscriptions = AGENT_SIGNAL_SUBSCRIPTIONS[degradedAgent] ?? [];
    if (degradedSubscriptions.length === 0) return [];

    const alternatives: Array<{ agent: string; overlap: number }> = [];

    for (const [agent, subs] of Object.entries(AGENT_SIGNAL_SUBSCRIPTIONS)) {
      if (agent === degradedAgent) continue;

      const overlap = subs.filter(s => degradedSubscriptions.includes(s as never)).length;
      if (overlap > 0) {
        alternatives.push({ agent, overlap });
      }
    }

    // Sort by overlap descending — most capable first
    return alternatives
      .sort((a, b) => b.overlap - a.overlap)
      .map(a => a.agent);
  }

  /** Filter to only healthy agents */
  private async filterHealthy(tenantId: string, agents: string[]): Promise<string[]> {
    const redis = getRedisConnection();
    const healthy: string[] = [];

    for (const agent of agents) {
      const heartbeatKey = `agent:${agent}:heartbeat`;
      const heartbeat = await redis.get(heartbeatKey);

      if (heartbeat) {
        const parsed = JSON.parse(heartbeat);
        const age = Date.now() - new Date(parsed.timestamp).getTime();
        if (age < 5 * 60 * 1000) {
          // Heartbeat is fresh (< 5 min)
          healthy.push(agent);
        }
      }
    }

    return healthy;
  }

  private async redistributeTasks(
    tenantId: string,
    degradedAgent: string,
    alternatives: string[],
  ): Promise<void> {
    const redis = getRedisConnection();

    // Mark redistribution in Redis for the task router to pick up
    await redis.setex(
      `brain:redistribute:${tenantId}:${degradedAgent}`,
      3_600,
      JSON.stringify({
        from: degradedAgent,
        to: alternatives,
        appliedAt: new Date().toISOString(),
      }),
    );
  }

  private async notifyNoAlternatives(tenantId: string, degradedAgent: string): Promise<void> {
    const redis = getRedisConnection();
    const notificationKey = `brain:notifications:${tenantId}`;

    await redis.rpush(notificationKey, JSON.stringify({
      type: 'agent-degraded-no-alternatives',
      severity: 'high',
      message: `Agent "${degradedAgent}" is degraded but no healthy alternatives are available for task redistribution`,
      timestamp: new Date().toISOString(),
    }));
    await redis.expire(notificationKey, 604_800);
  }
}
