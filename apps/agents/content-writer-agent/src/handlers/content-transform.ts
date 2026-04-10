import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * Content Transform Handler
 *
 * Repurposes long-form content into multiple derivative formats:
 * blog → email, social, newsletter, video script, etc.
 *
 * Ported from: ai-marketing-skills content-strategy/SKILL.md
 */
export class ContentTransformHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      sourceContent,
      sourceTitle = '',
      sourceType = 'blog_post',
      targetFormats = ['email', 'twitter', 'linkedin', 'newsletter_blurb', 'video_script_outline'],
      tone = 'professional',
      brand,
    } = input;

    const prompt = `You are a content repurposing specialist. Transform this ${sourceType} into multiple formats.

SOURCE TITLE: ${sourceTitle}
SOURCE CONTENT (first 4000 chars):
${(sourceContent || '').slice(0, 4000)}

TONE: ${tone}
${brand ? `BRAND VOICE: ${brand}` : ''}

TARGET FORMATS: ${targetFormats.join(', ')}

Return JSON:
{
  "transforms": {
${targetFormats.map((f: string) => `    "${f}": { "content": string, "charCount": number, "notes": string }`).join(',\n')}
  },
  "sharedHooks": [string],
  "keyMessages": [string]
}

Format-specific rules:
- twitter: max 280 chars, punchy, include relevant hashtags
- linkedin: 1000-1300 chars, professional, end with question/CTA
- email: subject line + preview text + body, max 500 words
- newsletter_blurb: 150-200 words, link-back CTA
- video_script_outline: hook, 3-5 key points, CTA, estimated duration
- instagram: caption with strategic hashtags, story slides outline
- thread: 5-10 tweet thread with numbering`;

    const raw = await routedCompletion({
      model: ModelPreset.LONG_FORM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 6144,
      temperature: 0.7,
    });

    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'content_transform',
          category: 'creation',
          reasoning: `Transformed ${sourceType} into ${targetFormats.length} formats: ${targetFormats.join(', ')}.`,
          trigger: { taskType: 'content_transform' },
          afterState: { sourceType, formats: targetFormats, formatCount: targetFormats.length },
          confidence: 0.85,
          impactMetric: 'content_pieces_created',
          impactDelta: targetFormats.length,
        });
      });
    } catch (e) {
      console.warn('Failed to log content transform:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { transformed: result, completedAt: new Date().toISOString() };
  }
}
