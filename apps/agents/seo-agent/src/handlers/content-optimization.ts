import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
import { withTenantDb, agentActions } from '@nexuszero/db';
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

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'content_optimization',
          category: 'optimization',
          reasoning: `Optimized content for ${targetKeywords.length} target keywords. URL: ${url || 'N/A'}.`,
          trigger: { taskType: 'content_optimization', url, targetKeywords },
          beforeState: { title, bodyLength: body.length },
          afterState: optimization,
          confidence: 0.75,
          impactMetric: 'content_score',
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);

    return {
      optimization,
      originalTitle: title,
      url,
      completedAt: new Date().toISOString(),
    };
  }
}
