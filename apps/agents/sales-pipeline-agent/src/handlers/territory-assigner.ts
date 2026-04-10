import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmAnalyzeSales } from '../llm.js';

/**
 * Territory Assigner Handler
 *
 * Automated territory assignment using firmographic data,
 * rep capacity, and balanced workload distribution.
 *
 * Ported from: ai-marketing-skills sales-pipeline/SKILL.md
 */
export class TerritoryAssignerHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { leads = [], reps = [], rules = {} } = input;

    const prompt = `You are a sales operations analyst. Assign leads to reps.

LEADS TO ASSIGN:
${JSON.stringify(leads.slice(0, 50), null, 2)}

REP ROSTER:
${JSON.stringify(reps, null, 2)}

RULES:
${JSON.stringify(rules)}

Return JSON:
{
  "assignments": [
    {
      "leadId": string,
      "company": string,
      "assignedTo": string,
      "reason": string,
      "matchScore": number
    }
  ],
  "repWorkload": [
    {
      "rep": string,
      "assigned": number,
      "totalPipelineValue": number,
      "capacityUtilization": number
    }
  ],
  "unassigned": [
    { "leadId": string, "reason": string }
  ]
}

Assignment criteria (priority order):
1. Geographic proximity / timezone match
2. Industry expertise
3. Current workload balance
4. Deal size fit (enterprise reps for big deals)
5. Round-robin for ties`;

    const raw = await llmAnalyzeSales(prompt);
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
          actionType: 'territory_assignment',
          category: 'operations',
          reasoning: `Assigned ${result.assignments?.length || 0} leads across ${result.repWorkload?.length || 0} reps. ${result.unassigned?.length || 0} unassigned.`,
          trigger: { taskType: 'territory_assignment' },
          afterState: { assigned: result.assignments?.length || 0, unassigned: result.unassigned?.length || 0 },
          confidence: 0.85,
          impactMetric: 'leads_assigned',
          impactDelta: result.assignments?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log territory assignment:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { territories: result, completedAt: new Date().toISOString() };
  }
}
