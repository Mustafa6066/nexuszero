import type { ReactionConfig, ReactionEvent, ReactionTrigger, ReactionAction } from '../types.js';
import { DEFAULT_REACTION_CONFIGS } from '../types.js';
import { createLogger } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import { DiagnoseAndRetryHandler } from './handlers/diagnose-and-retry.js';
import { InvestigateAndAdjustHandler } from './handlers/investigate-and-adjust.js';
import { ProposeStrategyUpdateHandler } from './handlers/propose-strategy-update.js';
import { ThrottleAndNotifyHandler } from './handlers/throttle-and-notify.js';
import { RedistributeLoadHandler } from './handlers/redistribute-load.js';
import { EscalationManager } from './escalation.js';

// ---------------------------------------------------------------------------
// Reaction Engine — Phase 3
//
// Maps events → configurable reactions. Each tenant can override default
// reaction configs (auto/manual, escalation timeouts, retry counts).
//
// Inspired by Agent Orchestrator's lifecycle-manager.ts reaction wiring.
// ---------------------------------------------------------------------------

const logger = createLogger('brain:reaction-engine');

export interface ReactionHandlers {
  'diagnose-and-retry': DiagnoseAndRetryHandler;
  'investigate-and-adjust': InvestigateAndAdjustHandler;
  'propose-strategy-update': ProposeStrategyUpdateHandler;
  'throttle-and-notify': ThrottleAndNotifyHandler;
  'redistribute-load': RedistributeLoadHandler;
  'escalate-to-manager': EscalationManager;
}

type RegisteredReactionAction = keyof ReactionHandlers;

export class ReactionEngine {
  private handlers: Partial<ReactionHandlers> = {};
  private escalation: EscalationManager;
  private pendingEvents = new Map<string, ReactionEvent[]>();

  constructor(handlers: Partial<ReactionHandlers> = {}, escalation = new EscalationManager()) {
    this.handlers = {
      'diagnose-and-retry': new DiagnoseAndRetryHandler(),
      'investigate-and-adjust': new InvestigateAndAdjustHandler(),
      'propose-strategy-update': new ProposeStrategyUpdateHandler(),
      'throttle-and-notify': new ThrottleAndNotifyHandler(),
      'redistribute-load': new RedistributeLoadHandler(),
      'escalate-to-manager': escalation,
      ...handlers,
    };
    this.escalation = escalation;
  }

  getPendingReactions(tenantId: string): ReactionEvent[] {
    return [...(this.pendingEvents.get(tenantId) ?? [])];
  }

  async processReactions(
    tenantId: string,
    picture: { recentOutcomes: Array<{ taskId: string; taskType: string; agentType: string; status: string }>; fleet: { agents: Array<{ agentType: string; activity: string; healthScore: number }> }; kpiSnapshot: Record<string, number> },
    reasoning: { strategyEvaluations: Array<{ strategyId: string; status: string; reason: string }> },
  ): Promise<void> {
    const events: ReactionEvent[] = [];

    for (const outcome of picture.recentOutcomes.filter((item) => item.status === 'failed').slice(0, 3)) {
      events.push({
        id: `${tenantId}:task-failed:${outcome.taskId}`,
        tenantId,
        trigger: 'task-failed',
        context: { outcome },
        sourceEvent: outcome as Record<string, unknown>,
        sourceAgentType: outcome.agentType,
        status: 'pending',
        attempts: 0,
        startedAt: new Date(),
      });
    }

    for (const agent of picture.fleet.agents.filter((item) => item.activity === 'degraded' || item.activity === 'blocked')) {
      events.push({
        id: `${tenantId}:agent-degraded:${agent.agentType}`,
        tenantId,
        trigger: 'agent-degraded',
        context: { agent },
        sourceEvent: agent as Record<string, unknown>,
        sourceAgentType: agent.agentType,
        status: 'pending',
        attempts: 0,
        startedAt: new Date(),
      });
    }

    for (const strategy of reasoning.strategyEvaluations.filter((item) => item.status === 'stale')) {
      events.push({
        id: `${tenantId}:strategy-stale:${strategy.strategyId}`,
        tenantId,
        trigger: 'strategy-stale',
        context: { strategy },
        sourceEvent: strategy as Record<string, unknown>,
        status: 'pending',
        attempts: 0,
        startedAt: new Date(),
      });
    }

    const budgetUsedPercent = picture.kpiSnapshot.budgetUsedPercent;
    if (typeof budgetUsedPercent === 'number' && budgetUsedPercent >= 80) {
      events.push({
        id: `${tenantId}:budget-threshold:${Date.now()}`,
        tenantId,
        trigger: 'budget-threshold',
        context: picture.kpiSnapshot,
        sourceEvent: picture.kpiSnapshot as Record<string, unknown>,
        status: 'pending',
        attempts: 0,
        startedAt: new Date(),
      });
    }

    if (events.length > 0) {
      await this.reactBatch(tenantId, events);
    }
  }

  /** Process a reaction event: match trigger → look up config → execute handler */
  async react(tenantId: string, event: ReactionEvent): Promise<void> {
    const config = await this.getReactionConfig(tenantId, event.trigger);
    if (!config) {
      logger.debug('No reaction config for trigger', { tenantId, trigger: event.trigger });
      return;
    }

    if (!config.auto) {
      this.addPendingReaction(tenantId, event);
      logger.info('Manual reaction — queuing for approval', { tenantId, trigger: event.trigger });
      await this.queueForApproval(tenantId, event, config);
      return;
    }

    logger.info('Executing reaction', {
      tenantId,
      trigger: event.trigger,
      action: config.action,
    });

    try {
      await this.executeAction(tenantId, event, config);
      this.removePendingReaction(tenantId, event.id);
      await this.recordReaction(tenantId, event, config, 'success');
    } catch (err) {
      logger.error('Reaction handler failed', { err, tenantId, trigger: event.trigger });
      this.addPendingReaction(tenantId, { ...event, status: 'failed', attempts: event.attempts + 1 });
      await this.recordReaction(tenantId, event, config, 'failed');

      // Escalate on handler failure
      if (config.escalateAfterMs) {
        await this.escalation.scheduleEscalation(tenantId, event, config);
      }
    }
  }

  /** Process multiple events in batch */
  async reactBatch(tenantId: string, events: ReactionEvent[]): Promise<void> {
    for (const event of events) {
      await this.react(tenantId, event);
    }
  }

  /** Get tenant-specific config, falling back to defaults */
  private async getReactionConfig(
    tenantId: string,
    trigger: ReactionTrigger,
  ): Promise<ReactionConfig | undefined> {
    const redis = getRedisConnection();
    const key = `brain:reaction-config:${tenantId}`;
    const cached = await redis.get(key);

    if (cached) {
      try {
        const configs = JSON.parse(cached) as ReactionConfig[];
        const match = configs.find(c => c.trigger === trigger);
        if (match) return match;
      } catch {
        // Fall through to defaults
      }
    }

    return DEFAULT_REACTION_CONFIGS.find(c => c.trigger === trigger);
  }

  private async executeAction(
    tenantId: string,
    event: ReactionEvent,
    config: ReactionConfig,
  ): Promise<void> {
    const handler = this.handlers[config.action as RegisteredReactionAction];
    if (!handler) {
      logger.warn('No handler registered for action', { action: config.action });
      return;
    }

    await handler.handle(tenantId, event, config);
  }

  private async queueForApproval(
    tenantId: string,
    event: ReactionEvent,
    config: ReactionConfig,
  ): Promise<void> {
    const redis = getRedisConnection();
    const approvalKey = `brain:approvals:${tenantId}`;

    await redis.rpush(approvalKey, JSON.stringify({
      event,
      config,
      queuedAt: new Date().toISOString(),
    }));
    await redis.expire(approvalKey, 86_400); // 24h
  }

  private async recordReaction(
    tenantId: string,
    event: ReactionEvent,
    config: ReactionConfig,
    outcome: 'success' | 'failed',
  ): Promise<void> {
    const redis = getRedisConnection();
    const key = `brain:reaction-log:${tenantId}`;

    await redis.rpush(key, JSON.stringify({
      trigger: event.trigger,
      action: config.action,
      outcome,
      timestamp: new Date().toISOString(),
    }));
    // Keep last 100 reaction logs
    await redis.ltrim(key, -100, -1);
    await redis.expire(key, 604_800); // 7 days
  }

  private addPendingReaction(tenantId: string, event: ReactionEvent): void {
    const current = this.pendingEvents.get(tenantId) ?? [];
    if (!current.some((item) => item.id === event.id)) {
      this.pendingEvents.set(tenantId, [...current, event]);
    }
  }

  private removePendingReaction(tenantId: string, eventId: string): void {
    const current = this.pendingEvents.get(tenantId) ?? [];
    this.pendingEvents.set(
      tenantId,
      current.filter((item) => item.id !== eventId),
    );
  }
}
