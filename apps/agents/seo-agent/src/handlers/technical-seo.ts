import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
import { withTenantDb, agentActions } from '@nexuszero/db';
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

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'technical_seo_check',
          category: 'analysis',
          reasoning: `Technical SEO audit for ${url || 'unknown URL'}. Issues found: ${issues.length}.`,
          trigger: { taskType: 'technical_seo_check', url, issueCount: issues.length },
          beforeState: { pageSpeed, mobileFriendly, existingIssues: issues.length },
          afterState: audit,
          confidence: 0.8,
          impactMetric: 'technical_score',
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);

    return {
      technicalAudit: audit,
      url,
      completedAt: new Date().toISOString(),
    };
  }
}
