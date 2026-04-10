import { createLogger } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import { routedCompletionWithUsage } from '@nexuszero/llm-router';
import type { ReactionConfig, ReactionEvent } from '../../types.js';

// ---------------------------------------------------------------------------
// Investigate-and-Adjust Handler
//
// When anomaly signals arrive, the Brain reasons about the cause and adjusts
// agent priorities accordingly.
// ---------------------------------------------------------------------------

const logger = createLogger('brain:reaction:investigate');

export class InvestigateAndAdjustHandler {
  async handle(
    tenantId: string,
    event: ReactionEvent,
    _config: ReactionConfig,
  ): Promise<void> {
    const investigation = await this.investigate(tenantId, event);

    if (investigation.adjustments.length > 0) {
      await this.applyAdjustments(tenantId, investigation.adjustments);
    }

    await this.recordInvestigation(tenantId, event, investigation);

    logger.info('Investigation complete', {
      tenantId,
      trigger: event.trigger,
      finding: investigation.summary,
      adjustmentCount: investigation.adjustments.length,
    });
  }

  private async investigate(
    tenantId: string,
    event: ReactionEvent,
  ): Promise<{
    summary: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    adjustments: Array<{ agentType: string; action: string; priority: number }>;
  }> {
    const context = JSON.stringify(event.context, null, 2);

    const result = await routedCompletionWithUsage({
      model: 'anthropic/claude-3.5-haiku-20241022',
      systemPrompt: `You are an anomaly investigator for a multi-agent AI system.
Given an anomaly event, determine:
1. Summary of the anomaly (1 sentence)
2. Severity: low, medium, high, or critical
3. Priority adjustments for affected agents

Respond ONLY with valid JSON:
{"summary": "...", "severity": "...", "adjustments": [{"agentType": "...", "action": "increase_priority|decrease_priority|pause|resume", "priority": 0-10}]}`,
      messages: [{ role: 'user', content: `Anomaly event:\n${context}` }],
      maxTokens: 300,
      temperature: 0.2,
      agentType: 'brain',
    });

    try {
      return JSON.parse(result.content);
    } catch {
      return {
        summary: 'Unable to analyze anomaly — no adjustments made',
        severity: 'low',
        adjustments: [],
      };
    }
  }

  private async applyAdjustments(
    tenantId: string,
    adjustments: Array<{ agentType: string; action: string; priority: number }>,
  ): Promise<void> {
    const redis = getRedisConnection();

    for (const adjustment of adjustments) {
      const key = `brain:agent-priority:${tenantId}:${adjustment.agentType}`;
      await redis.setex(key, 3_600, JSON.stringify({
        action: adjustment.action,
        priority: adjustment.priority,
        appliedAt: new Date().toISOString(),
      }));
    }
  }

  private async recordInvestigation(
    tenantId: string,
    event: ReactionEvent,
    investigation: { summary: string; severity: string },
  ): Promise<void> {
    const redis = getRedisConnection();
    const key = `brain:investigations:${tenantId}`;
    await redis.rpush(key, JSON.stringify({
      trigger: event.trigger,
      ...investigation,
      timestamp: new Date().toISOString(),
    }));
    await redis.ltrim(key, -50, -1);
    await redis.expire(key, 604_800);
  }
}
