import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmOutbound } from '../llm.js';

/**
 * Competitor Monitor Handler
 *
 * Tracks competitor changes: pricing, features, positioning,
 * content strategy, job postings (intent signals).
 *
 * Ported from: ai-marketing-skills outbound/SKILL.md
 */
export class CompetitorMonitorHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { competitors = [], previousSnapshot = {}, signals = [] } = input;

    const prompt = `You are a competitive intelligence analyst. Analyze competitor changes.

COMPETITORS:
${JSON.stringify(competitors.slice(0, 5), null, 2)}

PREVIOUS SNAPSHOT:
${JSON.stringify(previousSnapshot, null, 2)}

RECENT SIGNALS (job postings, press releases, product updates):
${JSON.stringify(signals.slice(0, 20), null, 2)}

Return JSON:
{
  "changes": [
    {
      "competitor": string,
      "changeType": "pricing" | "feature" | "positioning" | "hiring" | "content" | "partnership",
      "description": string,
      "impact": "high" | "medium" | "low",
      "actionableInsight": string,
      "suggestedResponse": string
    }
  ],
  "hiringSignals": [
    {
      "competitor": string,
      "roles": string[],
      "interpretation": string,
      "opportunityForUs": string
    }
  ],
  "threatAssessment": {
    "overall": "high" | "medium" | "low",
    "topThreats": string[],
    "opportunities": string[]
  }
}`;

    const raw = await llmOutbound(prompt);
    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    const highImpactChanges = result.changes?.filter((c: any) => c.impact === 'high') || [];
    if (highImpactChanges.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'outbound',
        type: 'outbound.competitor_changed',
        data: { changes: highImpactChanges.length, competitors: [...new Set(highImpactChanges.map((c: any) => c.competitor))] },
      });
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'competitor_monitor',
          category: 'intelligence',
          reasoning: `Detected ${result.changes?.length || 0} competitor changes (${highImpactChanges.length} high-impact). Threat level: ${result.threatAssessment?.overall || 'unknown'}.`,
          trigger: { taskType: 'competitor_monitor' },
          afterState: { changes: result.changes?.length || 0, threatLevel: result.threatAssessment?.overall },
          confidence: 0.7,
          impactMetric: 'competitor_changes',
          impactDelta: result.changes?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log competitor monitor:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { competitive: result, completedAt: new Date().toISOString() };
  }
}
