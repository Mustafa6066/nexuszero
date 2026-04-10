import type { Job } from 'bullmq';
import { withTenantDb, agentActions, contentScores } from '@nexuszero/db';
import { getCurrentTenantId, runExpertPanel } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';

/**
 * Expert Panel Review Handler
 *
 * Runs multi-persona expert panel scoring on content before publishing.
 * Auto-assembles 7-10 experts, scores content recursively to 90+.
 *
 * Ported from: ai-marketing-skills writing/SKILL.md
 */
export class ExpertPanelReviewHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { content, contentType = 'blog_post', targetScore = 90, campaignId } = input;

    const result = await runExpertPanel(content, {
      contentType,
      targetScore,
      maxRounds: 3,
    });

    await job.updateProgress(80);

    // Store score in DB
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(contentScores).values({
          tenantId,
          contentRef: campaignId || job.id || 'unknown',
          contentType,
          overallScore: result.finalScore,
          dimensions: result.expertScores as any,
          slopFlags: result.humanizerFlags || [],
        });

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'expert_panel_review',
          category: 'quality',
          reasoning: `Expert panel scored content at ${result.finalScore}/100 after ${result.rounds} round(s). ${result.passed ? 'PASSED' : 'NEEDS_REVISION'}`,
          trigger: { taskType: 'expert_panel_review' },
          afterState: { score: result.finalScore, rounds: result.rounds, passed: result.passed },
          confidence: 0.9,
          impactMetric: 'content_quality_score',
          impactDelta: result.finalScore,
        });
      });
    } catch (e) {
      console.warn('Failed to log expert panel result:', (e as Error).message);
    }

    // Signal quality gate result
    const signalType = result.passed ? 'content.quality_gate_passed' : 'content.quality_gate_failed';
    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'content-writer',
      type: signalType,
      data: {
        contentRef: campaignId || job.id,
        score: result.finalScore,
        contentType,
      },
    });

    await job.updateProgress(100);
    return {
      score: result.finalScore,
      passed: result.passed,
      rounds: result.rounds,
      expertScores: result.expertScores,
      revisedContent: result.revisedContent,
      completedAt: new Date().toISOString(),
    };
  }
}
