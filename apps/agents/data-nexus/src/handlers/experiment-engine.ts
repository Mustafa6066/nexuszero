import type { Job } from 'bullmq';
import { withTenantDb, agentActions, experiments, experimentDataPoints } from '@nexuszero/db';
import { getCurrentTenantId, evaluateExperiment, bootstrapConfidenceInterval } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * Experiment Engine Handler
 *
 * Manages A/B and multivariate tests with dual-threshold analysis:
 * requires BOTH statistical significance (p < 0.05) AND practical
 * significance (≥15% lift) before declaring a winner.
 *
 * Ported from: ai-marketing-skills growth/SKILL.md
 */
export class ExperimentEngineHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { action = 'evaluate', experimentId, config, dataPoints } = input;

    switch (action) {
      case 'create':
        return this.createExperiment(tenantId, config, job);
      case 'add_data':
        return this.addData(tenantId, experimentId, dataPoints, job);
      case 'evaluate':
        return this.evaluateExperiment(tenantId, experimentId, job);
      default:
        throw new Error(`Unknown experiment action: ${action}`);
    }
  }

  private async createExperiment(tenantId: string, config: any, job: Job): Promise<any> {
    const { name, hypothesis, metric, variants = ['control', 'variant_a'], channel, minSampleSize = 100 } = config;

    let experimentId: string | undefined;
    await withTenantDb(tenantId, async (db) => {
      const [exp] = await db.insert(experiments).values({
        tenantId,
        name,
        hypothesis,
        metric,
        channel: channel || 'web',
        variants: variants as any,
        status: 'running',
        startDate: new Date(),
        metadata: { minSampleSize },
      }).returning({ id: experiments.id });
      experimentId = exp.id;
    });

    await job.updateProgress(100);
    return { experimentId, status: 'created', completedAt: new Date().toISOString() };
  }

  private async addData(tenantId: string, experimentId: string, dataPoints: any[], job: Job): Promise<any> {
    let count = 0;
    await withTenantDb(tenantId, async (db) => {
      const rows = dataPoints.map((dp: any) => ({
        tenantId,
        experimentId,
        variant: dp.variant,
        value: dp.value,
        metadata: dp.metadata || {},
      }));
      await db.insert(experimentDataPoints).values(rows);
      count = rows.length;
    });

    await job.updateProgress(100);
    return { added: count, completedAt: new Date().toISOString() };
  }

  private async evaluateExperiment(tenantId: string, experimentId: string, job: Job): Promise<any> {
    let expData: any;
    let points: any[] = [];

    await withTenantDb(tenantId, async (db) => {
      const { eq } = await import('drizzle-orm');
      const [exp] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
      expData = exp;
      points = await db.select().from(experimentDataPoints).where(eq(experimentDataPoints.experimentId, experimentId));
    });

    if (!expData) {
      return { error: 'Experiment not found' };
    }

    await job.updateProgress(40);

    // Group data by variant
    const variantData: Record<string, number[]> = {};
    for (const dp of points) {
      const key = dp.variant;
      if (!variantData[key]) variantData[key] = [];
      variantData[key].push(Number(dp.value));
    }

    const variantNames = Object.keys(variantData);
    if (variantNames.length < 2) {
      return { error: 'Need at least 2 variants with data', variants: variantNames };
    }

    const control = variantData[variantNames[0]];
    const variant = variantData[variantNames[1]];

    const evalResult = evaluateExperiment(control, variant, 0.15, 0.05, 15);

    await job.updateProgress(70);

    // Get LLM interpretation
    const prompt = `Interpret this A/B test result:
Experiment: ${expData.name}
Hypothesis: ${expData.hypothesis}
Metric: ${expData.metric}
Control (${variantNames[0]}): n=${control.length}, mean=${evalResult.controlMean.toFixed(4)}
Variant (${variantNames[1]}): n=${variant.length}, mean=${evalResult.variantMean.toFixed(4)}
Lift: ${(evalResult.lift * 100).toFixed(2)}%
P-value: ${evalResult.pValue.toFixed(4)}
Status: ${evalResult.status}
Winner: ${evalResult.winner || 'none'}

Provide a 2-3 sentence plain-english interpretation and a recommended action.
Return JSON: { "interpretation": string, "action": string, "confidence": "high" | "medium" | "low" }`;

    const raw = await routedCompletion({
      model: ModelPreset.FAST_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 512,
      temperature: 0.3,
    });

    let interpretation: any;
    try {
      interpretation = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      interpretation = { interpretation: raw, action: 'review', confidence: 'low' };
    }

    // Signal if experiment concluded
    if (evalResult.status === 'significant_winner') {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'data-nexus',
        type: 'growth.experiment_completed',
        data: {
          experimentId,
          winner: evalResult.winner,
          lift: evalResult.lift,
          metric: expData.metric,
        },
      });

      // Update experiment status
      await withTenantDb(tenantId, async (db) => {
        const { eq } = await import('drizzle-orm');
        await db.update(experiments).set({ status: 'completed', endDate: new Date() }).where(eq(experiments.id, experimentId));
      });
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'experiment_evaluate',
          category: 'analysis',
          reasoning: `Experiment "${expData.name}": ${evalResult.status}, lift=${(evalResult.lift * 100).toFixed(1)}%, p=${evalResult.pValue.toFixed(4)}`,
          trigger: { taskType: 'experiment_score' },
          afterState: evalResult,
          confidence: evalResult.status === 'significant_winner' ? 0.95 : 0.6,
          impactMetric: expData.metric,
          impactDelta: evalResult.lift,
        });
      });
    } catch (e) {
      console.warn('Failed to log experiment eval:', (e as Error).message);
    }

    await job.updateProgress(100);
    return {
      experiment: expData.name,
      result: evalResult,
      interpretation,
      sampleSizes: { [variantNames[0]]: control.length, [variantNames[1]]: variant.length },
      completedAt: new Date().toISOString(),
    };
  }
}
