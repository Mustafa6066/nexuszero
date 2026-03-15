import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { llmAnalyzeAudience } from '../llm.js';

export class AudienceTargeting {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      demographics = {},
      behaviors = {},
      campaignPerformance = {},
    } = input;

    await job.updateProgress(30);

    const analysis = await llmAnalyzeAudience({
      demographics,
      behaviors,
      campaignPerformance,
    });

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'audience_targeting',
          category: 'analysis',
          reasoning: 'Analyzed audience targeting: demographics, behaviors, and campaign performance.',
          trigger: { taskType: 'audience_targeting' },
          afterState: analysis,
          confidence: 0.75,
          impactMetric: 'audience_insights',
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);

    return {
      analysis,
      completedAt: new Date().toISOString(),
    };
  }
}
