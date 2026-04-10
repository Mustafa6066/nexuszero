import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmAnalyze } from '../llm.js';

/**
 * Trend Scout Handler
 *
 * Multi-source trend detection: Google Trends, Reddit surges,
 * industry news, competitor content velocity. Generates real-time
 * content opportunity alerts.
 *
 * Ported from: ai-marketing-skills seo-ops/SKILL.md
 */
export class TrendScoutHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const prompt = `You are a trend intelligence analyst for SEO content strategy.

INPUT DATA (search trends, social signals, competitor activity):
${JSON.stringify(input)}

Detect emerging trends and return JSON:

{
  "emergingTrends": [
    {
      "topic": string,
      "growthRate": number,
      "timeframe": string,
      "sources": string[],
      "currentVolume": number,
      "projectedPeakVolume": number,
      "peakWindow": string,
      "relevanceScore": number,
      "contentAngle": string,
      "urgency": "immediate" | "this_week" | "this_month" | "watch"
    }
  ],
  "redditSurges": [
    {
      "subreddit": string,
      "topic": string,
      "postCount": number,
      "engagementRate": number,
      "sentiment": "positive" | "neutral" | "negative",
      "seoAngle": string
    }
  ],
  "competitorMoves": [
    {
      "competitor": string,
      "action": string,
      "detectedDate": string,
      "contentVelocityChange": number,
      "topicsTargeted": string[],
      "threatLevel": "high" | "medium" | "low",
      "counterStrategy": string
    }
  ],
  "contentCalendar": [
    {
      "topic": string,
      "publishDeadline": string,
      "format": string,
      "targetKeywords": string[],
      "estimatedTraffic": number,
      "rationale": string
    }
  ],
  "decayAlerts": [
    {
      "url": string,
      "topic": string,
      "trafficDecline": number,
      "cause": string,
      "refreshAction": string,
      "priority": "high" | "medium" | "low"
    }
  ]
}

Rules:
- Growth rate = % increase over previous period
- Relevance score = 0-1, combining topic-brand fit, search volume potential, competition level
- Urgency thresholds: >200% growth in 7d = immediate, >100% in 14d = this_week, >50% in 30d = this_month
- Content calendar items sorted by publishDeadline ascending
- Include competitor content velocity (posts/week) changes >25%`;

    const analysis = await llmAnalyze(prompt);
    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(analysis.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      result = { raw: analysis };
    }

    // Signal immediate trends to content writer
    const immediateTrends = result.emergingTrends?.filter((t: any) => t.urgency === 'immediate') || [];
    if (immediateTrends.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'seo-worker',
        type: 'seo_keywords_updated',
        data: {
          keywordGaps: immediateTrends.map((t: any) => t.topic),
          source: 'trend_scouting',
        },
      });
    }

    // Signal competitor threat intelligence
    const highThreats = result.competitorMoves?.filter((c: any) => c.threatLevel === 'high') || [];
    if (highThreats.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'seo-worker',
        type: 'seo_competitor_alert',
        data: {
          competitors: highThreats.map((c: any) => ({
            domain: c.competitor,
            changeType: 'content_velocity',
            details: c.action,
          })),
        },
      });
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'trend_scouting',
          category: 'analysis',
          reasoning: `Detected ${result.emergingTrends?.length || 0} trends (${immediateTrends.length} immediate), ${result.competitorMoves?.length || 0} competitor moves, ${result.decayAlerts?.length || 0} decay alerts.`,
          trigger: { taskType: 'trend_scouting' },
          afterState: {
            trendCount: result.emergingTrends?.length || 0,
            immediateCount: immediateTrends.length,
            competitorMoves: result.competitorMoves?.length || 0,
          },
          confidence: 0.75,
          impactMetric: 'trends_detected',
          impactDelta: result.emergingTrends?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { trendIntel: result, completedAt: new Date().toISOString() };
  }
}
