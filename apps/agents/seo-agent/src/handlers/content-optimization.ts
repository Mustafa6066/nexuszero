import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmOptimizeContent } from '../llm.js';

export class ContentOptimizationHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      title = '',
      body = '',
      targetKeywords = [],
      url = '',
    } = input;

    await job.updateProgress(30);

    const optimization = await llmOptimizeContent({
      title,
      body,
      targetKeywords,
      url,
      market: input.market,
    });

    await job.updateProgress(100);

    return {
      optimization,
      originalTitle: title,
      url,
      completedAt: new Date().toISOString(),
    };
  }
}
