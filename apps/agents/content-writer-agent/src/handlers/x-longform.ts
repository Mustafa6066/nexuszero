import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId, runAutoresearch } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';

/**
 * X Longform Post Handler
 *
 * Generates high-engagement X/Twitter longform posts using
 * autoresearch engine for iterative quality optimization.
 * Optimized for algorithmic reach: hooks, formatting, CTAs.
 *
 * Ported from: ai-marketing-skills social-media/SKILL.md
 */
export class XLongformHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      topic,
      angle,
      tone = 'authoritative',
      targetAudience,
      keyPoints = [],
      maxLength = 2000,
    } = input;

    const briefPrompt = `Write a high-engagement X (Twitter) longform post.

TOPIC: ${topic}
ANGLE: ${angle || 'thought leadership'}
TONE: ${tone}
AUDIENCE: ${targetAudience || 'tech professionals'}
KEY POINTS: ${keyPoints.join('; ') || 'derive from topic'}
MAX LENGTH: ~${maxLength} characters

X longform best practices:
- Opening hook: contrarian take, surprising stat, or bold claim
- Use line breaks every 1-2 sentences
- Use → ✅ ❌ 🔑 sparingly for scannability
- End with clear CTA (follow, repost, comment)
- No hashtags in longform posts
- Write like a human expert, not a brand
- Include 1-2 specific numbers or examples`;

    const result = await runAutoresearch({
      topic,
      briefPrompt,
      contentType: 'x_longform',
      variants: 3,
      rounds: 2,
      topK: 1,
    });

    await job.updateProgress(80);

    const bestContent = result.winner?.content || result.variants?.[0]?.content || '';

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'x_longform_post',
          category: 'creation',
          reasoning: `Generated X longform post via autoresearch: ${result.rounds} rounds, best score ${result.winner?.score || 0}/100.`,
          trigger: { taskType: 'x_longform_post' },
          afterState: { score: result.winner?.score || 0, rounds: result.rounds, charCount: bestContent.length },
          confidence: 0.85,
          impactMetric: 'content_quality_score',
          impactDelta: result.winner?.score || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log X longform:', (e as Error).message);
    }

    await job.updateProgress(100);
    return {
      post: bestContent,
      score: result.winner?.score || 0,
      allVariants: result.variants?.map((v: any) => ({ content: v.content, score: v.score })),
      completedAt: new Date().toISOString(),
    };
  }
}
