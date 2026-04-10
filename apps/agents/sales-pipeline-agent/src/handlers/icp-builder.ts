import type { Job } from 'bullmq';
import { withTenantDb, agentActions, icpProfiles } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmLongFormSales } from '../llm.js';

/**
 * ICP Builder Handler
 *
 * Builds and refines Ideal Customer Profile from deal data,
 * win/loss patterns, and firmographic analysis.
 *
 * Ported from: ai-marketing-skills sales-pipeline/SKILL.md
 */
export class IcpBuilderHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { deals = [], existingIcp, industry, segments = [] } = input;

    const prompt = `You are a sales strategist. Build/refine an Ideal Customer Profile.

${existingIcp ? `EXISTING ICP:\n${JSON.stringify(existingIcp)}\n` : ''}
DEAL HISTORY (wins & losses):
${JSON.stringify(deals.slice(0, 50), null, 2)}

INDUSTRY: ${industry || 'B2B SaaS'}
SEGMENTS: ${segments.join(', ') || 'all'}

Return JSON:
{
  "icp": {
    "firmographics": {
      "companySize": { "min": number, "max": number, "sweet_spot": string },
      "revenue": { "min": string, "max": string },
      "industries": string[],
      "geographies": string[],
      "techStack": string[]
    },
    "demographics": {
      "titles": string[],
      "departments": string[],
      "seniorityLevels": string[],
      "buyingCommitteeSize": number
    },
    "psychographics": {
      "painPoints": string[],
      "goals": string[],
      "triggers": string[],
      "objections": string[]
    },
    "behavioral": {
      "researchChannels": string[],
      "contentPreferences": string[],
      "buyingTimeline": string,
      "evaluationCriteria": string[]
    },
    "disqualifiers": string[],
    "scoringWeights": Record<string, number>
  },
  "segments": [
    {
      "name": string,
      "description": string,
      "winRate": number,
      "avgDealSize": number,
      "avgCycleLength": string,
      "priority": "primary" | "secondary" | "exploratory"
    }
  ],
  "dataGaps": string[]
}`;

    const raw = await llmLongFormSales(prompt);
    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(icpProfiles).values({
          tenantId,
          name: `ICP-${new Date().toISOString().slice(0, 10)}`,
          firmographics: result.icp?.firmographics || {},
          demographics: result.icp?.demographics || {},
          psychographics: result.icp?.psychographics || {},
          behavioral: result.icp?.behavioral || {},
          scoringWeights: result.icp?.scoringWeights || {},
        });

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'icp_build',
          category: 'analysis',
          reasoning: `Built ICP with ${result.segments?.length || 0} segments. ${result.dataGaps?.length || 0} data gaps identified.`,
          trigger: { taskType: 'icp_build' },
          afterState: { segmentCount: result.segments?.length || 0 },
          confidence: 0.8,
          impactMetric: 'icp_segments',
          impactDelta: result.segments?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to store ICP:', (e as Error).message);
    }

    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'sales-pipeline',
      type: 'sales.icp_updated',
      data: { segments: result.segments?.length || 0 },
    });

    await job.updateProgress(100);
    return { icp: result, completedAt: new Date().toISOString() };
  }
}
