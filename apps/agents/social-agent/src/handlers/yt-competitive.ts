import type { Job } from 'bullmq';
import { withTenantDb, agentActions, ytCompetitiveData } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * YouTube Competitive Analysis Handler
 *
 * Analyzes competitor YouTube channels: content cadence, outlier detection,
 * topic gaps, thumbnail/title patterns, audience engagement trends.
 *
 * Ported from: ai-marketing-skills social-media/SKILL.md
 */
export class YtCompetitiveHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      competitors = [],
      ownChannel = {},
      lookbackDays = 90,
    } = input;

    const prompt = `You are a YouTube growth strategist. Analyze competitive landscape.

OWN CHANNEL:
${JSON.stringify(ownChannel)}

COMPETITOR CHANNELS:
${JSON.stringify(competitors.slice(0, 5), null, 2)}

LOOKBACK: ${lookbackDays} days

Return JSON:
{
  "competitorProfiles": [
    {
      "channel": string,
      "subscribers": number,
      "avgViews": number,
      "uploadFrequency": string,
      "topPerforming": [
        {
          "title": string,
          "views": number,
          "engagement": number,
          "outlierScore": number,
          "whyItWorked": string
        }
      ],
      "contentMix": Record<string, number>,
      "thumbnailPatterns": string[],
      "titlePatterns": string[]
    }
  ],
  "outliers": [
    {
      "channel": string,
      "title": string,
      "views": number,
      "expectedViews": number,
      "outlierMultiple": number,
      "topic": string,
      "format": string,
      "replicableInsight": string
    }
  ],
  "topicGaps": [
    {
      "topic": string,
      "competitorsCovering": string[],
      "estimatedDemand": "high" | "medium" | "low",
      "suggestedAngle": string,
      "suggestedTitle": string
    }
  ],
  "contentRecommendations": [
    {
      "title": string,
      "topic": string,
      "format": string,
      "rationale": string,
      "estimatedViews": number,
      "priority": number
    }
  ],
  "trends": {
    "risingFormats": string[],
    "decliningFormats": string[],
    "emergingTopics": string[]
  }
}

Rules:
- Outlier = views > 3x channel average
- Topic gaps = topics competitors cover that own channel doesn't
- Content mix categories: tutorial, vlog, interview, review, news, shorts
- Sort outliers by outlierMultiple descending
- Sort recommendations by priority ascending`;

    const raw = await routedCompletion({
      model: ModelPreset.LONG_FORM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 6144,
      temperature: 0.5,
    });

    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    // Store competitive data and signal outliers
    try {
      await withTenantDb(tenantId, async (db) => {
        if (result.competitorProfiles) {
          for (const profile of result.competitorProfiles) {
            await db.insert(ytCompetitiveData).values({
              tenantId,
              channelId: profile.channel,
              channelName: profile.channel,
              metrics: {
                subscribers: profile.subscribers,
                avgViews: profile.avgViews,
                uploadFrequency: profile.uploadFrequency,
                contentMix: profile.contentMix,
              },
              outliers: profile.topPerforming || [],
              metadata: { thumbnailPatterns: profile.thumbnailPatterns, titlePatterns: profile.titlePatterns },
            });
          }
        }

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'yt_competitive_analysis',
          category: 'analysis',
          reasoning: `Analyzed ${result.competitorProfiles?.length || 0} competitor channels. Found ${result.outliers?.length || 0} outlier videos and ${result.topicGaps?.length || 0} topic gaps.`,
          trigger: { taskType: 'yt_competitive_analysis' },
          afterState: { competitors: result.competitorProfiles?.length || 0, outliers: result.outliers?.length || 0 },
          confidence: 0.75,
          impactMetric: 'topic_gaps_found',
          impactDelta: result.topicGaps?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to store YT competitive data:', (e as Error).message);
    }

    if (result.outliers?.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'social',
        type: 'social.yt_outlier_found',
        data: {
          outlierCount: result.outliers.length,
          topOutlier: result.outliers[0],
        },
      });
    }

    await job.updateProgress(100);
    return { competitive: result, completedAt: new Date().toISOString() };
  }
}
