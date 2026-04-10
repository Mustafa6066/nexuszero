import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmPodcast } from '../llm.js';

/**
 * Podcast Ingest Handler
 *
 * Processes podcast episodes: transcript parsing, speaker diarization,
 * topic segmentation, timestamp mapping, metadata extraction.
 *
 * Ported from: ai-marketing-skills/podcast
 */
export class PodcastIngestHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      episodeTitle,
      transcript,
      speakers = [],
      duration = 0,
      showName,
      publishDate,
      episodeUrl,
    } = input;

    if (!transcript || transcript.length < 100) {
      return { error: 'Transcript too short or missing', completedAt: new Date().toISOString() };
    }

    // Truncate transcript for LLM context
    const truncated = transcript.length > 30000 ? transcript.slice(0, 30000) + '\n[TRUNCATED]' : transcript;

    const prompt = `Analyze this podcast episode transcript and extract structured data.

EPISODE: ${episodeTitle}
SHOW: ${showName || 'Unknown'}
SPEAKERS: ${JSON.stringify(speakers)}
DURATION: ${duration}s

TRANSCRIPT:
${truncated}

Return JSON:
{
  "topics": [
    {
      "topic": string,
      "startTimestamp": string,
      "endTimestamp": string,
      "summary": string,
      "keyPoints": string[],
      "speakers": string[]
    }
  ],
  "quotes": [
    {
      "text": string,
      "speaker": string,
      "timestamp": string,
      "impactScore": number,
      "tweetWorthy": boolean
    }
  ],
  "keyInsights": [
    {
      "insight": string,
      "context": string,
      "actionable": boolean
    }
  ],
  "entities": {
    "people": string[],
    "companies": string[],
    "products": string[],
    "concepts": string[]
  },
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "contentDensityScore": number
}`;

    const raw = await llmPodcast(prompt);
    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'podcast',
      type: 'podcast.episode_ingested',
      data: {
        episodeTitle,
        topics: result.topics?.length || 0,
        quotes: result.quotes?.length || 0,
        insights: result.keyInsights?.length || 0,
      },
    });

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'podcast_ingest',
          category: 'content',
          reasoning: `Ingested "${episodeTitle}": ${result.topics?.length || 0} topics, ${result.quotes?.length || 0} quotes, ${result.keyInsights?.length || 0} insights extracted.`,
          trigger: { taskType: 'podcast_ingest', episodeTitle },
          afterState: { topics: result.topics?.length || 0, quotes: result.quotes?.length || 0 },
          confidence: 0.8,
          impactMetric: 'episodes_ingested',
          impactDelta: 1,
        });
      });
    } catch (e) {
      console.warn('Failed to log podcast ingest:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { ingestion: result, completedAt: new Date().toISOString() };
  }
}
