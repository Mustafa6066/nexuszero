import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { creativeLlm, parseLlmJson } from '../llm.js';

export class BrandConsistencyHandler {
  async execute(_taskType: string, payload: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const prompt = `Evaluate creative assets for brand guideline compliance. Brand guidelines and creative data: ${JSON.stringify(payload)}
Return JSON:
{
  "overallCompliance": number (0-100),
  "status": "compliant" | "minor_issues" | "major_issues" | "non_compliant",
  "checks": [
    {
      "category": "color" | "typography" | "logo" | "tone" | "imagery" | "messaging",
      "status": "pass" | "warning" | "fail",
      "detail": string,
      "suggestion": string | null
    }
  ],
  "colorPaletteAdherence": number (0-100),
  "toneConsistency": number (0-100),
  "corrections": [{ "issue": string, "fix": string, "priority": "low" | "medium" | "high" }],
  "approvalRecommendation": "approve" | "revise" | "reject"
}`;

    const raw = await creativeLlm(prompt, 'You are a brand guardian. Ensure every creative asset maintains brand integrity while allowing creative freedom.');
    await job.updateProgress(70);

    let result: Record<string, unknown>;
    try {
      result = parseLlmJson(raw);
    } catch {
      result = { raw, parseError: true };
    }

    const status = result.status as string;
    if (status === 'major_issues' || status === 'non_compliant') {
      await publishAgentSignal({
        tenantId,
        agentId: 'creative-worker',
        type: 'brand_violation_detected',
        data: {
          compliance: result.overallCompliance,
          status,
          corrections: result.corrections,
          creativeId: payload.creativeId,
        },
      });
    }

    await this.logAction(tenantId, 'brand_consistency', `Brand check: ${result.approvalRecommendation ?? status} (${result.overallCompliance ?? 0}%)`, result);
    await job.updateProgress(100);
    return { taskType: 'brand_consistency_check', ...result };
  }

  private async logAction(tenantId: string, category: string, action: string, result: Record<string, unknown>) {
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentType: 'creative',
          category,
          action,
          reasoning: `Brand guideline compliance analysis`,
          impact: action,
          metadata: { resultKeys: Object.keys(result) },
        });
      });
    } catch { /* non-critical */ }
  }
}
