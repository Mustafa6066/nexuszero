import type { Job } from 'bullmq';
import { withTenantDb, agentActions, revenueAttributions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * Revenue Attribution Handler
 *
 * Multi-touch attribution modeling: first-touch, last-touch, linear,
 * time-decay, and position-based models. Maps revenue back to
 * marketing channels and campaigns.
 *
 * Ported from: ai-marketing-skills finance/SKILL.md
 */
export class RevenueAttributionHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      touchpoints = [],
      conversions = [],
      models = ['first_touch', 'last_touch', 'linear', 'time_decay', 'position_based'],
      period,
    } = input;

    // Compute attribution per model
    const attributionResults: Record<string, Record<string, number>> = {};

    for (const model of models) {
      attributionResults[model] = this.computeAttribution(touchpoints, conversions, model);
    }

    await job.updateProgress(50);

    // Get LLM synthesis
    const prompt = `Analyze these multi-touch attribution results and provide insights.

ATTRIBUTION BY MODEL:
${JSON.stringify(attributionResults, null, 2)}

PERIOD: ${period || 'last 30 days'}
TOTAL CONVERSIONS: ${conversions.length}
TOTAL TOUCHPOINTS: ${touchpoints.length}

Return JSON:
{
  "channelRankings": [
    {
      "channel": string,
      "avgAttributionShare": number,
      "bestModel": string,
      "worstModel": string,
      "consensus": "strong" | "moderate" | "weak",
      "recommendation": string
    }
  ],
  "modelAgreement": number,
  "keyInsights": [string],
  "budgetRecommendations": [
    {
      "channel": string,
      "currentShare": number,
      "recommendedShare": number,
      "rationale": string
    }
  ]
}`;

    const raw = await routedCompletion({
      model: ModelPreset.FAST_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      temperature: 0.3,
    });

    await job.updateProgress(80);

    let synthesis: any;
    try {
      synthesis = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      synthesis = { raw };
    }

    // Store attribution
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(revenueAttributions).values({
          tenantId,
          period: period || 'last_30d',
          model: 'multi_model',
          channelBreakdown: attributionResults as any,
          totalRevenue: conversions.reduce((sum: number, c: any) => sum + (c.value || 0), 0),
          metadata: { synthesis },
        });

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'revenue_attribution',
          category: 'analysis',
          reasoning: `Computed ${models.length}-model attribution across ${Object.keys(attributionResults.linear || {}).length} channels. Model agreement: ${synthesis.modelAgreement || 'N/A'}.`,
          trigger: { taskType: 'revenue_attribution' },
          afterState: { models: models.length, channels: Object.keys(attributionResults.linear || {}).length },
          confidence: 0.8,
          impactMetric: 'attribution_models',
          impactDelta: models.length,
        });
      });
    } catch (e) {
      console.warn('Failed to store attribution:', (e as Error).message);
    }

    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'data-nexus',
      type: 'revenue.attribution_updated',
      data: { period, models },
    });

    await job.updateProgress(100);
    return { attribution: attributionResults, synthesis, completedAt: new Date().toISOString() };
  }

  private computeAttribution(
    touchpoints: any[],
    conversions: any[],
    model: string,
  ): Record<string, number> {
    const channelCredit: Record<string, number> = {};

    for (const conversion of conversions) {
      const journey = touchpoints
        .filter((tp: any) => tp.userId === conversion.userId)
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (journey.length === 0) continue;

      const value = conversion.value || 1;

      switch (model) {
        case 'first_touch':
          channelCredit[journey[0].channel] = (channelCredit[journey[0].channel] || 0) + value;
          break;

        case 'last_touch':
          channelCredit[journey[journey.length - 1].channel] = (channelCredit[journey[journey.length - 1].channel] || 0) + value;
          break;

        case 'linear': {
          const share = value / journey.length;
          for (const tp of journey) {
            channelCredit[tp.channel] = (channelCredit[tp.channel] || 0) + share;
          }
          break;
        }

        case 'time_decay': {
          const convTime = new Date(conversion.timestamp).getTime();
          const weights = journey.map((tp: any) => {
            const daysBefore = (convTime - new Date(tp.timestamp).getTime()) / 86_400_000;
            return Math.pow(0.5, daysBefore / 7); // Half-life of 7 days
          });
          const totalWeight = weights.reduce((a: number, b: number) => a + b, 0);
          journey.forEach((tp: any, i: number) => {
            channelCredit[tp.channel] = (channelCredit[tp.channel] || 0) + value * (weights[i] / totalWeight);
          });
          break;
        }

        case 'position_based': {
          // 40% first, 40% last, 20% split among middle
          if (journey.length === 1) {
            channelCredit[journey[0].channel] = (channelCredit[journey[0].channel] || 0) + value;
          } else if (journey.length === 2) {
            channelCredit[journey[0].channel] = (channelCredit[journey[0].channel] || 0) + value * 0.5;
            channelCredit[journey[1].channel] = (channelCredit[journey[1].channel] || 0) + value * 0.5;
          } else {
            channelCredit[journey[0].channel] = (channelCredit[journey[0].channel] || 0) + value * 0.4;
            channelCredit[journey[journey.length - 1].channel] = (channelCredit[journey[journey.length - 1].channel] || 0) + value * 0.4;
            const middleShare = (value * 0.2) / (journey.length - 2);
            for (let i = 1; i < journey.length - 1; i++) {
              channelCredit[journey[i].channel] = (channelCredit[journey[i].channel] || 0) + middleShare;
            }
          }
          break;
        }
      }
    }

    return channelCredit;
  }
}
