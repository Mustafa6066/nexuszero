import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId, detectAnomalies } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { creativeLlm, parseLlmJson } from '../llm.js';

export class FatigueDetectionHandler {
  async execute(taskType: string, payload: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    switch (taskType) {
      case 'fatigue_detection':
        return this.detectFatigue(tenantId, payload, job);
      case 'creative_scoring':
        return this.scoreCreative(tenantId, payload, job);
      default:
        throw new Error(`Unknown fatigue task: ${taskType}`);
    }
  }

  private async detectFatigue(tenantId: string, payload: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    await job.updateProgress(20);

    // Run anomaly detection on performance metrics
    const performanceData = payload.performanceHistory as number[] ?? [];
    let anomalyResult: Record<string, unknown> = {};
    if (performanceData.length > 0) {
      anomalyResult = detectAnomalies(performanceData) as unknown as Record<string, unknown>;
    }

    await job.updateProgress(50);

    const prompt = `Analyze creative performance data for fatigue signals. Data: ${JSON.stringify({ ...payload, anomalies: anomalyResult })}
Return JSON:
{
  "fatigueScore": number (0-100, higher = more fatigued),
  "status": "healthy" | "early_warning" | "fatigued" | "exhausted",
  "signals": [{ "indicator": string, "severity": "low" | "medium" | "high", "detail": string }],
  "frequencyCap": { "current": number, "recommended": number },
  "audienceSaturation": number (0-100),
  "recommendations": string[],
  "refreshUrgency": "none" | "low" | "medium" | "high" | "critical"
}`;

    const raw = await creativeLlm(prompt, 'You are a media buying expert specializing in creative fatigue analysis. Identify performance decline patterns.');
    await job.updateProgress(80);

    let result: Record<string, unknown>;
    try {
      result = { ...parseLlmJson(raw), anomalies: anomalyResult };
    } catch {
      result = { raw, anomalies: anomalyResult, parseError: true };
    }

    const status = result.status as string;
    if (status === 'fatigued' || status === 'exhausted') {
      await publishAgentSignal({
        tenantId,
        agentId: 'creative-worker',
        type: 'creative_fatigue_detected',
        data: {
          fatigueScore: result.fatigueScore,
          status,
          refreshUrgency: result.refreshUrgency,
          creativeId: payload.creativeId,
        },
      });
    }

    await this.logAction(tenantId, 'fatigue_detection', `Fatigue check: ${status} (score: ${result.fatigueScore ?? 'N/A'})`, result);
    await job.updateProgress(100);
    return { taskType: 'fatigue_detection', ...result };
  }

  private async scoreCreative(tenantId: string, payload: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    await job.updateProgress(20);

    const prompt = `Score this creative asset on multiple quality dimensions. Creative data: ${JSON.stringify(payload)}
Return JSON:
{
  "overallScore": number (0-100),
  "dimensions": {
    "visualImpact": { "score": number, "feedback": string },
    "messageClarity": { "score": number, "feedback": string },
    "brandAlignment": { "score": number, "feedback": string },
    "emotionalResonance": { "score": number, "feedback": string },
    "callToAction": { "score": number, "feedback": string },
    "audienceRelevance": { "score": number, "feedback": string }
  },
  "strengths": string[],
  "improvements": string[],
  "predictedPerformance": { "ctr": string, "conversionRate": string, "engagementRate": string }
}`;

    const raw = await creativeLlm(prompt, 'You are a creative director with deep expertise in performance marketing. Score creatives objectively.');
    await job.updateProgress(80);

    let result: Record<string, unknown>;
    try {
      result = parseLlmJson(raw);
    } catch {
      result = { raw, parseError: true };
    }

    await this.logAction(tenantId, 'creative_scoring', `Scored creative: ${result.overallScore ?? 'N/A'}/100`, result);
    await job.updateProgress(100);
    return { taskType: 'creative_scoring', ...result };
  }

  private async logAction(tenantId: string, category: string, action: string, result: Record<string, unknown>) {
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentType: 'creative',
          category,
          action,
          reasoning: `Creative performance analysis and scoring`,
          impact: action,
          metadata: { resultKeys: Object.keys(result) },
        });
      });
    } catch { /* non-critical */ }
  }
}
