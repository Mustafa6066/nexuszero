import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId, scanForSlop } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmPodcastLongForm } from '../llm.js';

/**
 * Content Generate Handler
 *
 * Generates platform-native content from podcast content atoms:
 * Twitter threads, LinkedIn posts, newsletter sections, blog posts,
 * short-form video scripts, audiogram captions.
 *
 * Includes AI slop detection to ensure authentic output.
 *
 * Ported from: ai-marketing-skills/podcast
 */
export class ContentGenerateHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      atoms = [],
      platform,
      brandVoice = {},
      episodeTitle,
      showName,
      episodeUrl,
    } = input;

    const platformInstructions: Record<string, string> = {
      twitter: 'Write a Twitter/X thread (5-12 tweets). Each tweet ≤280 chars. First tweet = hook. Use line breaks, no hashtags except last tweet.',
      linkedin: 'Write a LinkedIn post (1200-1500 chars). Open with pattern interrupt. Use short paragraphs, strategic line breaks. End with question or CTA.',
      newsletter: 'Write a newsletter section (400-600 words). Conversational tone. Include "Key Takeaway" callout. Link back to episode.',
      blog: 'Write a blog post (800-1500 words). SEO-optimized H2/H3 structure. Include a TL;DR section. Embed key quotes.',
      video_script: 'Write a short-form video script (60-90 seconds). Hook in first 3 seconds. Visual cues in brackets. End with CTA.',
      audiogram: 'Write 3 audiogram captions (each <200 chars). Punchy, quotable, standalone.',
    };

    const instruction = platformInstructions[platform] || platformInstructions.twitter;

    const prompt = `Generate ${platform} content from these podcast content atoms.

EPISODE: ${episodeTitle}
SHOW: ${showName || 'Unknown'}
${episodeUrl ? `URL: ${episodeUrl}` : ''}
BRAND VOICE: ${JSON.stringify(brandVoice)}
ATOMS: ${JSON.stringify(atoms.slice(0, 10), null, 2)}

INSTRUCTIONS: ${instruction}

IMPORTANT: Write in a natural, human voice. Avoid AI-sounding phrases like "dive deep", "game-changer", "unlocking", "leveraging".

Return JSON:
{
  "content": string | string[],
  "platform": string,
  "characterCount": number,
  "hooks": string[],
  "cta": string,
  "hashtags": string[],
  "estimatedEngagement": "high" | "medium" | "low",
  "bestPostTime": string
}`;

    const raw = await llmPodcastLongForm(prompt);
    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    // Slop check on generated content
    const contentToCheck = Array.isArray(result.content) ? result.content.join(' ') : (result.content || '');
    const slopReport = scanForSlop(contentToCheck);
    result.slopScore = slopReport.score;
    result.slopFlags = slopReport.flags;

    await job.updateProgress(90);

    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'podcast',
      type: 'podcast.content_generated',
      data: { platform, episodeTitle, slopScore: slopReport.score },
    });

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'content_generate',
          category: 'content',
          reasoning: `Generated ${platform} content from ${atoms.length} atoms for "${episodeTitle}". Slop score: ${slopReport.score}.`,
          trigger: { taskType: 'content_generate', platform, episodeTitle },
          afterState: { platform, slopScore: slopReport.score, engagement: result.estimatedEngagement },
          confidence: 0.75,
          impactMetric: 'content_pieces',
          impactDelta: 1,
        });
      });
    } catch (e) {
      console.warn('Failed to log content generate:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { generated: result, completedAt: new Date().toISOString() };
  }
}
