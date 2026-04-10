import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmPodcast } from '../llm.js';

/**
 * Viral Score Handler
 *
 * Scores content atoms and generated pieces for viral potential.
 * Uses multi-dimensional scoring: novelty, emotional resonance,
 * shareability, controversy, practical value, timing.
 *
 * Ported from: ai-marketing-skills/podcast
 */
export class ViralScoreHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      items = [],
      platform = 'twitter',
      audienceProfile = {},
      trendingTopics = [],
    } = input;

    const prompt = `Score these content items for viral potential on ${platform}.

ITEMS TO SCORE:
${JSON.stringify(items.slice(0, 15), null, 2)}

AUDIENCE PROFILE: ${JSON.stringify(audienceProfile)}
CURRENTLY TRENDING: ${JSON.stringify(trendingTopics.slice(0, 10))}

Score each item on these dimensions (0-10):
- Novelty: How surprising or new is this?
- EmotionalResonance: Does it trigger strong emotions?
- Shareability: Would someone share this to look smart/helpful?
- Controversy: Does it challenge common beliefs? (moderate = good)
- PracticalValue: Can someone act on this immediately?
- TimingRelevance: Does it connect to current trends?

Return JSON:
{
  "scored": [
    {
      "itemIndex": number,
      "viralScore": number,
      "dimensions": {
        "novelty": number,
        "emotionalResonance": number,
        "shareability": number,
        "controversy": number,
        "practicalValue": number,
        "timingRelevance": number
      },
      "viralPotential": "high" | "medium" | "low",
      "bestHook": string,
      "amplificationTips": string[]
    }
  ],
  "topPicks": number[],
  "distributionStrategy": {
    "leadWith": number,
    "sequence": number[],
    "spacing": string,
    "peakPostTimes": string[]
  }
}`;

    const raw = await llmPodcast(prompt);
    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    // Deterministic: sort by viralScore descending
    if (result.scored && Array.isArray(result.scored)) {
      result.scored.sort((a: any, b: any) => (b.viralScore || 0) - (a.viralScore || 0));
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'viral_score',
          category: 'content',
          reasoning: `Scored ${result.scored?.length || 0} items for ${platform} virality. Top picks: ${result.topPicks?.length || 0}. High potential: ${result.scored?.filter((s: any) => s.viralPotential === 'high').length || 0}.`,
          trigger: { taskType: 'viral_score', platform },
          afterState: { scored: result.scored?.length || 0, highPotential: result.scored?.filter((s: any) => s.viralPotential === 'high').length || 0 },
          confidence: 0.7,
          impactMetric: 'items_scored',
          impactDelta: result.scored?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log viral score:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { scoring: result, completedAt: new Date().toISOString() };
  }
}
