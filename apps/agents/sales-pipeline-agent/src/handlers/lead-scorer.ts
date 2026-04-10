import type { Job } from 'bullmq';
import { withTenantDb, agentActions, prospectSignals } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmAnalyzeSales } from '../llm.js';

/**
 * Lead Scorer Handler
 *
 * Scores leads against ICP using multi-signal analysis:
 * firmographic fit, behavioral signals, engagement scoring,
 * technographic match.
 *
 * Ported from: ai-marketing-skills sales-pipeline/SKILL.md
 */
export class LeadScorerHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { leads = [], icpProfile, thresholds = { hot: 80, warm: 60, cold: 40 } } = input;

    const prompt = `You are a lead scoring engine. Score these leads against the ICP.

ICP PROFILE:
${JSON.stringify(icpProfile, null, 2)}

LEADS TO SCORE:
${JSON.stringify(leads.slice(0, 30), null, 2)}

THRESHOLDS: Hot >= ${thresholds.hot}, Warm >= ${thresholds.warm}, Cold >= ${thresholds.cold}

Return JSON:
{
  "scoredLeads": [
    {
      "leadId": string,
      "company": string,
      "overallScore": number,
      "tier": "hot" | "warm" | "cold" | "disqualified",
      "breakdown": {
        "firmographic": number,
        "behavioral": number,
        "engagement": number,
        "technographic": number
      },
      "signals": string[],
      "disqualifiers": string[],
      "recommendedAction": string,
      "nextBestAction": string
    }
  ],
  "summary": {
    "total": number,
    "hot": number,
    "warm": number,
    "cold": number,
    "disqualified": number,
    "avgScore": number
  }
}

Scoring formula:
- Firmographic (30%): company size, revenue, industry, geography
- Behavioral (30%): content engagement, site visits, demo requests
- Engagement (20%): email opens, clicks, responses
- Technographic (20%): tech stack fit, integrations`;

    const raw = await llmAnalyzeSales(prompt);
    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    // Store signals and signal hot leads
    try {
      await withTenantDb(tenantId, async (db) => {
        const hotLeads = result.scoredLeads?.filter((l: any) => l.tier === 'hot') || [];
        for (const lead of hotLeads) {
          await db.insert(prospectSignals).values({
            tenantId,
            prospectRef: lead.leadId,
            signalType: 'lead_score',
            score: lead.overallScore,
            data: { breakdown: lead.breakdown, signals: lead.signals },
          });
        }

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'lead_score',
          category: 'scoring',
          reasoning: `Scored ${result.summary?.total || 0} leads: ${result.summary?.hot || 0} hot, ${result.summary?.warm || 0} warm, ${result.summary?.cold || 0} cold.`,
          trigger: { taskType: 'lead_score' },
          afterState: result.summary || {},
          confidence: 0.85,
          impactMetric: 'hot_leads',
          impactDelta: result.summary?.hot || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to store lead scores:', (e as Error).message);
    }

    const hotLeads = result.scoredLeads?.filter((l: any) => l.tier === 'hot') || [];
    if (hotLeads.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'sales-pipeline',
        type: 'sales.lead_scored',
        data: { hotCount: hotLeads.length, leads: hotLeads.map((l: any) => l.leadId) },
      });
    }

    await job.updateProgress(100);
    return { scored: result, completedAt: new Date().toISOString() };
  }
}
