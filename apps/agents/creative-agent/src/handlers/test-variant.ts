import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { bayesianABTest, evaluateExperiment } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { creativeLlm, parseLlmJson } from '../llm.js';

export class TestVariantHandler {
  async execute(taskType: string, payload: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    switch (taskType) {
      case 'ab_test_setup':
        return this.setupTest(tenantId, payload, job);
      case 'ab_test_analysis':
        return this.analyzeTest(tenantId, payload, job);
      case 'winner_scaling':
        return this.scaleWinner(tenantId, payload, job);
      default:
        throw new Error(`Unknown test variant task: ${taskType}`);
    }
  }

  private async setupTest(tenantId: string, payload: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const prompt = `Design an A/B test for creative variants. Input: ${JSON.stringify(payload)}
Return JSON:
{
  "testName": string,
  "hypothesis": string,
  "variants": [{ "id": string, "name": string, "changes": string[], "expectedImpact": string }],
  "sampleSize": number,
  "duration": string,
  "primaryMetric": string,
  "secondaryMetrics": string[],
  "confidenceLevel": number
}`;

    const raw = await creativeLlm(prompt, 'You are a conversion optimization expert. Design statistically rigorous experiments.');
    await job.updateProgress(70);

    let result: Record<string, unknown>;
    try {
      result = parseLlmJson(raw);
    } catch {
      result = { raw, parseError: true };
    }

    await this.logAction(tenantId, 'ab_test_setup', `Set up A/B test: ${(result.testName as string) ?? 'unnamed'}`, result);
    await job.updateProgress(100);
    return { taskType: 'ab_test_setup', ...result };
  }

  private async analyzeTest(tenantId: string, payload: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    await job.updateProgress(20);

    const variants = payload.variants as Array<{ impressions: number; conversions: number }> ?? [];
    let statisticalResult: Record<string, unknown> = {};

    if (variants.length === 2) {
      const [control, treatment] = variants;
      const bayesian = bayesianABTest(
        control.conversions, control.impressions,
        treatment.conversions, treatment.impressions,
      );
      statisticalResult = { bayesian };
    }

    if (payload.experimentData) {
      const evaluation = evaluateExperiment(payload.experimentData as any);
      statisticalResult = { ...statisticalResult, evaluation };
    }

    await job.updateProgress(60);

    const prompt = `Analyze A/B test results and provide recommendations. Data: ${JSON.stringify({ ...payload, statistical: statisticalResult })}
Return JSON:
{
  "winner": string | null,
  "confidence": number,
  "lift": string,
  "recommendation": string,
  "insights": string[],
  "nextSteps": string[]
}`;

    const raw = await creativeLlm(prompt, 'You are a data-driven creative strategist. Provide clear, actionable analysis.');
    await job.updateProgress(90);

    let result: Record<string, unknown>;
    try {
      result = { ...parseLlmJson(raw), statistical: statisticalResult };
    } catch {
      result = { raw, statistical: statisticalResult, parseError: true };
    }

    await this.logAction(tenantId, 'ab_test_analysis', `Analyzed A/B test: ${result.winner ? `Winner: ${result.winner}` : 'No clear winner'}`, result);
    await job.updateProgress(100);
    return { taskType: 'ab_test_analysis', ...result };
  }

  private async scaleWinner(tenantId: string, payload: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    await job.updateProgress(20);

    const prompt = `Create a scaling plan for the winning creative variant. Winner data: ${JSON.stringify(payload)}
Return JSON:
{
  "scalingPlan": { "channels": string[], "budgetAllocation": Record<string, number>, "timeline": string },
  "adaptations": [{ "platform": string, "format": string, "adjustments": string[] }],
  "monitoringMetrics": string[],
  "rollbackCriteria": string
}`;

    const raw = await creativeLlm(prompt, 'You are a performance marketing expert. Create efficient scaling strategies.');
    await job.updateProgress(80);

    let result: Record<string, unknown>;
    try {
      result = parseLlmJson(raw);
    } catch {
      result = { raw, parseError: true };
    }

    // Signal ad agent to update campaigns with winning creative
    await publishAgentSignal({
      tenantId,
      agentId: 'creative-worker',
      type: 'creative_winner_scaled',
      data: { winnerId: payload.winnerId, ...result },
    });

    await this.logAction(tenantId, 'winner_scaling', 'Scaled winning creative variant', result);
    await job.updateProgress(100);
    return { taskType: 'winner_scaling', ...result };
  }

  private async logAction(tenantId: string, category: string, action: string, result: Record<string, unknown>) {
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentType: 'creative',
          category,
          action,
          reasoning: `Statistical analysis and LLM-powered variant testing`,
          impact: (result.winner as string) ?? (result.testName as string) ?? 'Test configured',
          metadata: { resultKeys: Object.keys(result) },
        });
      });
    } catch { /* non-critical */ }
  }
}
