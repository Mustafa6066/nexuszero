import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmPodcast } from '../llm.js';

/**
 * Calendar Build Handler
 *
 * Builds a content publishing calendar from scored podcast content.
 * Schedules content across platforms with optimal timing and cadence,
 * avoiding audience fatigue and maximizing episode lifecycle value.
 *
 * Ported from: ai-marketing-skills/podcast
 */
export class CalendarBuildHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      episodes = [],
      scoredContent = [],
      platforms = ['twitter', 'linkedin', 'newsletter'],
      cadence = { tweetsPerDay: 2, linkedinPerWeek: 3, newsletterPerWeek: 1 },
      existingCalendar = [],
      horizonDays = 14,
    } = input;

    const prompt = `Build a content publishing calendar from podcast-derived content.

EPISODES AVAILABLE:
${JSON.stringify(episodes.slice(0, 5), null, 2)}

SCORED CONTENT (sorted by viral score):
${JSON.stringify(scoredContent.slice(0, 20), null, 2)}

PLATFORMS: ${JSON.stringify(platforms)}
CADENCE: ${JSON.stringify(cadence)}
EXISTING CALENDAR: ${JSON.stringify(existingCalendar.slice(0, 10))}
HORIZON: ${horizonDays} days

Rules:
1. Lead with highest-viral-score content
2. Space episode promotions (don't cluster from same episode)
3. Vary content types across days
4. Newsletter gets exclusive/deeper content
5. Repurpose peak content across platforms with 24h+ gap
6. Leave buffer slots for trending topics

Return JSON:
{
  "calendar": [
    {
      "date": string,
      "dayOfWeek": string,
      "slots": [
        {
          "time": string,
          "platform": string,
          "contentType": string,
          "episodeSource": string,
          "contentPreview": string,
          "viralScore": number,
          "status": "scheduled" | "draft" | "buffer"
        }
      ]
    }
  ],
  "summary": {
    "totalPosts": number,
    "byPlatform": Record<string, number>,
    "byContentType": Record<string, number>,
    "episodeCoverage": number,
    "bufferSlots": number
  },
  "recommendations": string[]
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
          actionType: 'calendar_build',
          category: 'content',
          reasoning: `Built ${horizonDays}-day content calendar: ${result.summary?.totalPosts || 0} posts across ${platforms.length} platforms from ${episodes.length} episodes.`,
          trigger: { taskType: 'calendar_build', horizonDays },
          afterState: { totalPosts: result.summary?.totalPosts || 0, days: horizonDays },
          confidence: 0.8,
          impactMetric: 'calendar_slots',
          impactDelta: result.summary?.totalPosts || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log calendar build:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { calendar: result, completedAt: new Date().toISOString() };
  }
}
