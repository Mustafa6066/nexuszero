import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
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

    await job.updateProgress(100);

    return {
      analysis,
      completedAt: new Date().toISOString(),
    };
  }
}
