import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmAnalyze } from '../llm.js';

/**
 * Content Attack Brief Handler
 *
 * Full keyword intelligence pipeline: content fingerprint, BOFU keyword
 * ranking by Impact × Confidence, competitor gap analysis, decaying page
 * alerts, execution pipeline classification.
 *
 * Ported from: ai-marketing-skills seo-ops/SKILL.md
 */
export class ContentAttackBriefHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const prompt = `You are an elite SEO strategist. Create a comprehensive Content Attack Brief.

INPUT DATA:
${JSON.stringify(input)}

Analyze and return JSON with:
{
  "contentFingerprint": {
    "totalPages": number,
    "contentTypes": [{"type": string, "count": number, "avgTraffic": number}],
    "topPerformers": [{"url": string, "traffic": number, "topKeyword": string}],
    "decayingPages": [{"url": string, "trafficDrop": number, "period": string, "recommendation": string}]
  },
  "bofuKeywords": [
    {
      "keyword": string,
      "volume": number,
      "difficulty": number,
      "cpc": number,
      "funnelStage": "TOFU" | "MOFU" | "BOFU",
      "currentRank": number | null,
      "impactScore": number,
      "confidenceScore": number,
      "compositeScore": number,
      "executionType": "auto" | "semi-auto" | "team"
    }
  ],
  "competitorGaps": [
    {
      "keyword": string,
      "competitorDomain": string,
      "competitorRank": number,
      "ownRank": number | null,
      "opportunity": string
    }
  ],
  "executionPipeline": {
    "auto": [{"keyword": string, "action": string}],
    "semiAuto": [{"keyword": string, "action": string, "humanInput": string}],
    "team": [{"keyword": string, "action": string, "assignee": string}]
  },
  "prioritizedActions": [{"action": string, "priority": "high" | "medium" | "low", "estimatedImpact": string}]
}

Scoring formulas:
- Impact = (volume * 0.3) + (CPC * 0.2) + (funnelStageWeight * 0.3) + (trendMultiplier * 0.2)
  where BOFU=1.0, MOFU=0.6, TOFU=0.3
- Confidence = (1 - KD/100) * 0.4 + (currentRankBoost * 0.3) + (topicAuthority * 0.3)
- Composite = Impact × Confidence

Sort bofuKeywords by compositeScore descending.`;

    const analysis = await llmAnalyze(prompt);
    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(analysis.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      result = { raw: analysis };
    }

    // Signal keyword discoveries
    if (result.bofuKeywords?.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'seo-worker',
        type: 'seo_keywords_updated',
        data: {
          keywordGaps: result.bofuKeywords.slice(0, 20).map((k: any) => k.keyword),
          source: 'content_attack_brief',
        },
      });
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'content_attack_brief',
          category: 'analysis',
          reasoning: `Generated content attack brief with ${result.bofuKeywords?.length || 0} BOFU keywords and ${result.competitorGaps?.length || 0} competitor gaps.`,
          trigger: { taskType: 'content_attack_brief' },
          afterState: { keywordCount: result.bofuKeywords?.length || 0, gapCount: result.competitorGaps?.length || 0 },
          confidence: 0.85,
          impactMetric: 'keyword_opportunities',
          impactDelta: result.bofuKeywords?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { brief: result, completedAt: new Date().toISOString() };
  }
}
