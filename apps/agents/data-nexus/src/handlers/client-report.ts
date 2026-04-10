import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * Client Report Handler
 *
 * Generates client-ready performance reports with narrative
 * explanations, visualizations spec, and executive summary.
 *
 * Ported from: ai-marketing-skills growth/SKILL.md
 */
export class ClientReportHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      clientName,
      period,
      metrics = {},
      goals = {},
      previousPeriod = {},
      highlights = [],
      format = 'executive',
    } = input;

    const prompt = `You are a senior marketing strategist preparing a client report.

CLIENT: ${clientName || 'Client'}
PERIOD: ${period || 'this month'}
FORMAT: ${format}

CURRENT METRICS:
${JSON.stringify(metrics, null, 2)}

GOALS:
${JSON.stringify(goals, null, 2)}

PREVIOUS PERIOD:
${JSON.stringify(previousPeriod, null, 2)}

${highlights.length > 0 ? `KEY HIGHLIGHTS:\n${highlights.join('\n')}` : ''}

Return JSON:
{
  "report": {
    "executiveSummary": string,
    "sections": [
      {
        "title": string,
        "narrative": string,
        "metrics": [
          {
            "label": string,
            "current": number,
            "previous": number,
            "goal": number,
            "change": number,
            "status": "exceeded" | "on_track" | "behind"
          }
        ],
        "chartSpec": {
          "type": "line" | "bar" | "pie" | "table",
          "data": any
        } | null
      }
    ],
    "wins": [string],
    "challenges": [string],
    "nextSteps": [
      {
        "action": string,
        "timeline": string,
        "expectedOutcome": string
      }
    ],
    "appendix": {
      "dataQualityNotes": string[],
      "methodologyNotes": string[]
    }
  }
}

Rules:
- Executive summary: 4-5 sentences, lead with results
- No jargon — write for C-suite
- Change = ((current - previous) / previous) * 100
- Include 3-5 sections covering top channels
- Each section should have a narrative explanation, not just data`;

    const raw = await routedCompletion({
      model: ModelPreset.LONG_FORM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 8192,
      temperature: 0.5,
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
          actionType: 'client_report',
          category: 'reporting',
          reasoning: `Generated ${format} client report for ${clientName || 'client'}, period: ${period || 'current'}.`,
          trigger: { taskType: 'client_report' },
          afterState: { sections: result.report?.sections?.length || 0, format },
          confidence: 0.85,
          impactMetric: 'reports_generated',
          impactDelta: 1,
        });
      });
    } catch (e) {
      console.warn('Failed to log client report:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { report: result, completedAt: new Date().toISOString() };
  }
}
