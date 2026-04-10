import type { Job } from 'bullmq';
import { withTenantDb, agentActions, contentScores } from '@nexuszero/db';
import { getCurrentTenantId, scoreContent } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';

/**
 * Quality Gate Handler
 *
 * 5-dimension content quality scoring: voice similarity, specificity,
 * AI-slop penalty, length appropriateness, engagement potential.
 * Blocks publication if score < threshold.
 *
 * Ported from: ai-marketing-skills writing/SKILL.md
 */
export class QualityGateHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      content,
      contentType = 'blog_post',
      threshold = 75,
      voiceSamples = [],
      targetLength,
      campaignId,
    } = input;

    const result = await scoreContent(content, {
      voiceSamples,
      targetLength,
      contentType,
    });

    await job.updateProgress(80);

    const passed = result.overallScore >= threshold;

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(contentScores).values({
          tenantId,
          contentRef: campaignId || job.id || 'unknown',
          contentType,
          overallScore: result.overallScore,
          dimensions: result.dimensions as any,
          slopFlags: result.slopFlags || [],
        });

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'quality_gate',
          category: 'quality',
          reasoning: `Quality gate ${passed ? 'PASSED' : 'BLOCKED'}: ${result.overallScore}/${threshold}. Dims: voice=${result.dimensions.voiceSimilarity}, spec=${result.dimensions.specificity}, slop=${result.dimensions.aiSlopPenalty}, len=${result.dimensions.lengthAppropriateness}, engage=${result.dimensions.engagementPotential}`,
          trigger: { taskType: 'quality_gate' },
          afterState: { score: result.overallScore, threshold, passed, dimensions: result.dimensions },
          confidence: 0.85,
          impactMetric: 'quality_gate_score',
          impactDelta: result.overallScore,
        });
      });
    } catch (e) {
      console.warn('Failed to log quality gate result:', (e as Error).message);
    }

    const signalType = passed ? 'content.quality_gate_passed' : 'content.quality_gate_failed';
    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'content-writer',
      type: signalType,
      data: { contentRef: campaignId || job.id, score: result.overallScore, contentType },
    });

    await job.updateProgress(100);
    return {
      passed,
      score: result.overallScore,
      threshold,
      dimensions: result.dimensions,
      slopFlags: result.slopFlags,
      completedAt: new Date().toISOString(),
    };
  }
}
