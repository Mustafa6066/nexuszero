import type { Job } from 'bullmq';
import { withTenantDb, agentActions, croAudits } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * CRO Audit Handler
 *
 * Conversion Rate Optimization audit: analyzes landing pages, funnels,
 * and checkout flows for friction points. Generates prioritized
 * recommendations with estimated impact.
 *
 * Ported from: ai-marketing-skills conversion-optimization/SKILL.md
 */
export class CroAuditHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      pages = [],
      funnelData = {},
      currentConversionRate,
      industry,
      deviceBreakdown = {},
    } = input;

    const prompt = `You are a CRO specialist. Perform a comprehensive conversion rate optimization audit.

PAGES TO AUDIT:
${JSON.stringify(pages.slice(0, 10), null, 2)}

FUNNEL DATA:
${JSON.stringify(funnelData, null, 2)}

CURRENT CONVERSION RATE: ${currentConversionRate || 'unknown'}
INDUSTRY: ${industry || 'SaaS'}
DEVICE BREAKDOWN: ${JSON.stringify(deviceBreakdown)}

Return JSON:
{
  "overallScore": number,
  "funnelAnalysis": {
    "stages": [
      {
        "name": string,
        "dropoffRate": number,
        "severity": "critical" | "high" | "medium" | "low",
        "issues": string[],
        "fixes": string[]
      }
    ],
    "biggestLeaks": string[]
  },
  "pageAudits": [
    {
      "url": string,
      "score": number,
      "issues": [
        {
          "type": "copy" | "design" | "ux" | "trust" | "speed" | "mobile",
          "description": string,
          "impact": "high" | "medium" | "low",
          "fix": string,
          "estimatedLift": string
        }
      ]
    }
  ],
  "quickWins": [
    {
      "action": string,
      "page": string,
      "estimatedLift": string,
      "effort": "low" | "medium" | "high",
      "priority": number
    }
  ],
  "testingRoadmap": [
    {
      "hypothesis": string,
      "variable": string,
      "page": string,
      "expectedLift": string,
      "priority": number
    }
  ]
}

CRO scoring (0-100):
- Copy clarity: 25%
- Visual hierarchy: 20%
- Trust signals: 15%
- Mobile experience: 15%
- Page speed: 10%
- Form optimization: 15%`;

    const raw = await routedCompletion({
      model: ModelPreset.LONG_FORM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 6144,
      temperature: 0.4,
    });

    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    // Store audit
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(croAudits).values({
          tenantId,
          pageUrl: pages[0]?.url || 'multi-page',
          overallScore: result.overallScore || 0,
          issues: result.pageAudits?.flatMap((p: any) => p.issues) || [],
          recommendations: result.quickWins || [],
          metadata: { funnelAnalysis: result.funnelAnalysis, testingRoadmap: result.testingRoadmap },
        });

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'cro_audit',
          category: 'analysis',
          reasoning: `CRO audit score: ${result.overallScore || 0}/100. Found ${result.quickWins?.length || 0} quick wins, ${result.testingRoadmap?.length || 0} test hypotheses.`,
          trigger: { taskType: 'cro_audit' },
          afterState: { score: result.overallScore, quickWinCount: result.quickWins?.length || 0 },
          confidence: 0.8,
          impactMetric: 'cro_score',
          impactDelta: result.overallScore || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to store CRO audit:', (e as Error).message);
    }

    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'ad',
      type: 'conversion.cro_audit_completed',
      data: { score: result.overallScore, quickWinCount: result.quickWins?.length || 0 },
    });

    await job.updateProgress(100);
    return { audit: result, completedAt: new Date().toISOString() };
  }
}
