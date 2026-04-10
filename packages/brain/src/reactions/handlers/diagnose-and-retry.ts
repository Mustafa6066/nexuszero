import { createLogger } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import { routedCompletionWithUsage } from '@nexuszero/llm-router';
import type { ReactionConfig, ReactionEvent } from '../../types.js';

// ---------------------------------------------------------------------------
// Diagnose-and-Retry Handler
//
// Analyzes failure context (not blind retry), adjusts parameters, retries
// with modified configuration. Uses LLM to reason about failure cause.
// ---------------------------------------------------------------------------

const logger = createLogger('brain:reaction:diagnose-retry');

export class DiagnoseAndRetryHandler {
  async handle(
    tenantId: string,
    event: ReactionEvent,
    config: ReactionConfig,
  ): Promise<void> {
    const maxRetries = config.maxRetries ?? config.retries ?? 2;
    const retryCount = await this.getRetryCount(tenantId, event);

    if (retryCount >= maxRetries) {
      logger.warn('Max retries exhausted', { tenantId, trigger: event.trigger, retryCount });
      return;
    }

    // Analyze the failure
    const diagnosis = await this.diagnoseFailure(tenantId, event);

    // Record diagnosis
    await this.recordDiagnosis(tenantId, event, diagnosis);

    // Queue retry with adjusted parameters
    await this.queueRetry(tenantId, event, diagnosis);

    // Increment retry counter
    await this.incrementRetryCount(tenantId, event);

    logger.info('Diagnosed failure and queued retry', {
      tenantId,
      trigger: event.trigger,
      retryCount: retryCount + 1,
      diagnosis: diagnosis.summary,
    });
  }

  private async diagnoseFailure(
    tenantId: string,
    event: ReactionEvent,
  ): Promise<{ summary: string; rootCause: string; adjustments: Record<string, unknown> }> {
    const context = JSON.stringify(event.context, null, 2);

    const result = await routedCompletionWithUsage({
      model: 'anthropic/claude-3.5-haiku-20241022',
      systemPrompt: `You are a diagnostic AI analyzing task failures in a multi-agent system.
Given the failure context, determine:
1. Root cause (1 sentence)
2. Adjustments to make for retry (JSON object)
3. Summary (1 sentence)

Respond ONLY with valid JSON:
{"rootCause": "...", "adjustments": {...}, "summary": "..."}`,
      messages: [{ role: 'user', content: `Task failure context:\n${context}` }],
      maxTokens: 200,
      temperature: 0.2,
      agentType: 'brain',
    });

    try {
      return JSON.parse(result.content);
    } catch {
      return {
        summary: 'Unable to diagnose failure — retrying with defaults',
        rootCause: 'unknown',
        adjustments: {},
      };
    }
  }

  private async queueRetry(
    tenantId: string,
    event: ReactionEvent,
    diagnosis: { adjustments: Record<string, unknown> },
  ): Promise<void> {
    const redis = getRedisConnection();
    const retryKey = `brain:retry-queue:${tenantId}`;

    await redis.rpush(retryKey, JSON.stringify({
      originalEvent: event,
      adjustments: diagnosis.adjustments,
      scheduledAt: new Date().toISOString(),
    }));
    await redis.expire(retryKey, 3_600); // 1 hour TTL
  }

  private async getRetryCount(tenantId: string, event: ReactionEvent): Promise<number> {
    const redis = getRedisConnection();
    const key = `brain:retry-count:${tenantId}:${event.trigger}:${event.sourceAgentType ?? 'unknown'}`;
    const count = await redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  private async incrementRetryCount(tenantId: string, event: ReactionEvent): Promise<void> {
    const redis = getRedisConnection();
    const key = `brain:retry-count:${tenantId}:${event.trigger}:${event.sourceAgentType ?? 'unknown'}`;
    await redis.incr(key);
    await redis.expire(key, 3_600); // Reset after 1 hour
  }

  private async recordDiagnosis(
    tenantId: string,
    event: ReactionEvent,
    diagnosis: { summary: string; rootCause: string },
  ): Promise<void> {
    const redis = getRedisConnection();
    const key = `brain:diagnoses:${tenantId}`;
    await redis.rpush(key, JSON.stringify({
      trigger: event.trigger,
      ...diagnosis,
      timestamp: new Date().toISOString(),
    }));
    await redis.ltrim(key, -50, -1);
    await redis.expire(key, 604_800); // 7 days
  }
}
