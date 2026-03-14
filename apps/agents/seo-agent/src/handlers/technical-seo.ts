import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmTechnicalAudit } from '../llm.js';

export class TechnicalSeoHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { url, pageSpeed, mobileFriendly, issues = [] } = input;

    await job.updateProgress(30);

    const audit = await llmTechnicalAudit({
      url: url || '',
      pageSpeed,
      mobileFriendly,
      issues,
      market: input.market,
    });

    await job.updateProgress(100);

    return {
      technicalAudit: audit,
      url,
      completedAt: new Date().toISOString(),
    };
  }
}
