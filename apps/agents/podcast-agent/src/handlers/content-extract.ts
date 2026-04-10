import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmPodcast } from '../llm.js';

/**
 * Content Extract Handler
 *
 * Extracts "content atoms" from ingested podcast episodes:
 * individual reusable micro-content pieces (stats, stories, frameworks,
 * analogies, contrarian takes) that can be repurposed across channels.
 *
 * Ported from: ai-marketing-skills/podcast
 */
export class ContentExtractHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      episodeTitle,
      topics = [],
      quotes = [],
      keyInsights = [],
      transcript,
      targetPlatforms = ['twitter', 'linkedin', 'newsletter', 'blog'],
    } = input;

    const prompt = `Extract reusable "content atoms" from this podcast episode data.

EPISODE: ${episodeTitle}
TOPICS: ${JSON.stringify(topics.slice(0, 10), null, 2)}
QUOTES: ${JSON.stringify(quotes.slice(0, 15), null, 2)}
KEY INSIGHTS: ${JSON.stringify(keyInsights.slice(0, 10), null, 2)}
${transcript ? `TRANSCRIPT EXCERPT: ${transcript.slice(0, 5000)}` : ''}
TARGET PLATFORMS: ${JSON.stringify(targetPlatforms)}

A "content atom" is the smallest reusable unit: a stat, story, framework, analogy, hot take, or lesson.

Return JSON:
{
  "atoms": [
    {
      "id": string,
      "type": "stat" | "story" | "framework" | "analogy" | "hot_take" | "lesson" | "quote" | "case_study",
      "content": string,
      "source": string,
      "speaker": string | null,
      "platforms": string[],
      "hookPotential": number,
      "evergreen": boolean,
      "tags": string[]
    }
  ],
  "contentClusters": [
    {
      "theme": string,
      "atomIds": string[],
      "suggestedAngle": string,
      "estimatedPieces": number
    }
  ],
  "totalAtoms": number,
  "highPotentialCount": number
}`;

    const raw = await llmPodcast(prompt);
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
          actionType: 'content_extract',
          category: 'content',
          reasoning: `Extracted ${result.totalAtoms || result.atoms?.length || 0} content atoms from "${episodeTitle}". ${result.highPotentialCount || 0} high-potential. ${result.contentClusters?.length || 0} thematic clusters.`,
          trigger: { taskType: 'content_extract', episodeTitle },
          afterState: { atoms: result.totalAtoms || 0, clusters: result.contentClusters?.length || 0 },
          confidence: 0.8,
          impactMetric: 'content_atoms',
          impactDelta: result.totalAtoms || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log content extract:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { extraction: result, completedAt: new Date().toISOString() };
  }
}
