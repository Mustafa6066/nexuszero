import { createLogger } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import { routedCompletionWithUsage } from '@nexuszero/llm-router';
import type { ReactionConfig, ReactionEvent } from '../../types.js';

// ---------------------------------------------------------------------------
// Propose Strategy Update Handler
//
// When a strategy is detected as stale, this handler generates an updated
// strategy recommendation and queues it for human approval.
// ---------------------------------------------------------------------------

const logger = createLogger('brain:reaction:propose-update');

export class ProposeStrategyUpdateHandler {
  async handle(
    tenantId: string,
    event: ReactionEvent,
    _config: ReactionConfig,
  ): Promise<void> {
    const proposal = await this.generateProposal(tenantId, event);
    await this.queueProposal(tenantId, event, proposal);

    logger.info('Strategy update proposal queued for approval', {
      tenantId,
      trigger: event.trigger,
      proposalSummary: proposal.summary,
    });
  }

  private async generateProposal(
    tenantId: string,
    event: ReactionEvent,
  ): Promise<{
    summary: string;
    currentIssue: string;
    proposedChanges: string[];
    expectedImpact: string;
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    const context = JSON.stringify(event.context, null, 2);

    const result = await routedCompletionWithUsage({
      model: 'anthropic/claude-3.5-haiku-20241022',
      systemPrompt: `You are a strategy advisor for a multi-agent AI platform.
A strategy has been detected as stale or underperforming. Propose an update.

Respond ONLY with valid JSON:
{
  "summary": "One-sentence summary of the proposal",
  "currentIssue": "What's wrong with the current strategy",
  "proposedChanges": ["Change 1", "Change 2"],
  "expectedImpact": "Expected outcome of the changes",
  "riskLevel": "low|medium|high"
}`,
      messages: [{ role: 'user', content: `Stale strategy context:\n${context}` }],
      maxTokens: 400,
      temperature: 0.3,
      agentType: 'brain',
    });

    try {
      return JSON.parse(result.content);
    } catch {
      return {
        summary: 'Strategy review recommended — automatic analysis inconclusive',
        currentIssue: 'Unable to determine specific issue',
        proposedChanges: ['Manual review required'],
        expectedImpact: 'Unknown',
        riskLevel: 'medium',
      };
    }
  }

  private async queueProposal(
    tenantId: string,
    event: ReactionEvent,
    proposal: {
      summary: string;
      currentIssue: string;
      proposedChanges: string[];
      expectedImpact: string;
      riskLevel: string;
    },
  ): Promise<void> {
    const redis = getRedisConnection();
    const approvalKey = `brain:approvals:${tenantId}`;

    await redis.rpush(approvalKey, JSON.stringify({
      type: 'strategy-update',
      event,
      proposal,
      proposedAt: new Date().toISOString(),
    }));
    await redis.expire(approvalKey, 86_400); // 24h
  }
}
