import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * Weekly Scorecard Handler
 *
 * Generates weekly performance scorecard across all marketing channels.
 * Includes WoW trends, pacing vs goals, and executive summary.
 *
 * Ported from: ai-marketing-skills growth/SKILL.md
 */
export class WeeklyScorecardHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      metrics = {},
      goals = {},
      previousWeek = {},
      period,
    } = input;

    const prompt = `You are a marketing analytics director. Generate a weekly performance scorecard.

CURRENT WEEK METRICS:
${JSON.stringify(metrics, null, 2)}

GOALS/TARGETS:
${JSON.stringify(goals, null, 2)}

PREVIOUS WEEK (for WoW comparison):
${JSON.stringify(previousWeek, null, 2)}

PERIOD: ${period || 'current week'}

Return JSON:
{
  "scorecard": {
    "overallHealth": "green" | "yellow" | "red",
    "channels": [
      {
        "name": string,
        "metrics": [
          {
            "metric": string,
            "current": number,
            "goal": number,
            "pacing": number,
            "wow": number,
            "status": "on_track" | "at_risk" | "behind" | "ahead"
          }
        ],
        "health": "green" | "yellow" | "red",
        "insight": string
      }
    ]
  },
  "executiveSummary": string,
  "wins": [string],
  "risks": [string],
  "recommendations": [
    {
      "action": string,
      "priority": "high" | "medium" | "low",
      "expectedImpact": string,
      "owner": string
    }
  ],
  "pacingForecast": {
    "onTrackToHitGoals": boolean,
    "projectedEndOfMonth": Record<string, number>,
    "adjustmentsNeeded": string[]
  }
}

Rules:
- Pacing = (current / goal) * 100
- WoW = ((current - previous) / previous) * 100
- Green: pacing >= 90%, Yellow: 70-89%, Red: < 70%
- Executive summary: 3-4 sentences, data-driven, no fluff`;

    const raw = await routedCompletion({
      model: ModelPreset.LONG_FORM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      temperature: 0.4,
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
          actionType: 'weekly_scorecard',
          category: 'reporting',
          reasoning: `Generated weekly scorecard: ${result.scorecard?.overallHealth || 'unknown'} health. ${result.wins?.length || 0} wins, ${result.risks?.length || 0} risks.`,
          trigger: { taskType: 'weekly_scorecard' },
          afterState: { health: result.scorecard?.overallHealth, channelCount: result.scorecard?.channels?.length || 0 },
          confidence: 0.85,
          impactMetric: 'scorecard_health',
          impactDelta: result.scorecard?.overallHealth === 'green' ? 1 : result.scorecard?.overallHealth === 'yellow' ? 0 : -1,
        });
      });
    } catch (e) {
      console.warn('Failed to log weekly scorecard:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { scorecard: result, completedAt: new Date().toISOString() };
  }
}
