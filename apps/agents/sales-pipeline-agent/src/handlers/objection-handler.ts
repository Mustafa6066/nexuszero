import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmLongFormSales } from '../llm.js';

/**
 * Objection Handler / Battlecard Generator
 *
 * Generates competitive battlecards and objection-handling playbooks
 * from win/loss data and competitive intelligence.
 *
 * Ported from: ai-marketing-skills sales-pipeline/SKILL.md
 */
export class ObjectionHandlerHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { competitors = [], lostDeals = [], product, commonObjections = [] } = input;

    const prompt = `You are a competitive intelligence analyst. Generate battlecards.

PRODUCT: ${product || 'SaaS platform'}
COMPETITORS: ${JSON.stringify(competitors.slice(0, 5), null, 2)}
LOST DEAL FEEDBACK: ${JSON.stringify(lostDeals.slice(0, 20), null, 2)}
KNOWN OBJECTIONS: ${commonObjections.join('; ') || 'none provided'}

Return JSON:
{
  "battlecards": [
    {
      "competitor": string,
      "positioning": string,
      "strengths": string[],
      "weaknesses": string[],
      "landmines": [{ "question": string, "why": string }],
      "counterpoints": [
        { "theirClaim": string, "ourResponse": string, "proof": string }
      ],
      "winThemes": string[],
      "pricingIntel": string
    }
  ],
  "objectionPlaybook": [
    {
      "objection": string,
      "frequency": "common" | "occasional" | "rare",
      "severity": "deal_killer" | "serious" | "minor",
      "response": {
        "acknowledge": string,
        "reframe": string,
        "evidence": string,
        "redirect": string
      },
      "preventionTactic": string
    }
  ],
  "talkTracks": [
    {
      "scenario": string,
      "opening": string,
      "keyPoints": string[],
      "closeAttempt": string
    }
  ]
}`;

    const raw = await llmLongFormSales(prompt);
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
          actionType: 'objection_battlecard',
          category: 'enablement',
          reasoning: `Generated ${result.battlecards?.length || 0} battlecards, ${result.objectionPlaybook?.length || 0} objection handlers, ${result.talkTracks?.length || 0} talk tracks.`,
          trigger: { taskType: 'objection_battlecard' },
          afterState: { battlecards: result.battlecards?.length || 0, objections: result.objectionPlaybook?.length || 0 },
          confidence: 0.8,
          impactMetric: 'battlecards_generated',
          impactDelta: result.battlecards?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log battlecard:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { enablement: result, completedAt: new Date().toISOString() };
  }
}
