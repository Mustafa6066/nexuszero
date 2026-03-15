import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
import { withTenantDb, agentActions, integrations } from '@nexuszero/db';
import { eq, and, inArray } from 'drizzle-orm';
import { proposeCmsChange } from '@nexuszero/queue';
import { llmOptimizeContent } from '../llm.js';

const CMS_PLATFORMS = ['wordpress', 'webflow', 'shopify', 'contentful'] as const;

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

    // Propose CMS meta change if tenant has a CMS integration
    try {
      const cmsIntegration = await withTenantDb(tenantId, async (db) => {
        const [i] = await db.select().from(integrations)
          .where(and(
            eq(integrations.tenantId, tenantId),
            eq(integrations.status, 'connected'),
            inArray(integrations.platform, [...CMS_PLATFORMS]),
          ))
          .limit(1);
        return i;
      });

      if (cmsIntegration && optimization.metaTitle) {
        await proposeCmsChange({
          tenantId,
          integrationId: cmsIntegration.id,
          platform: cmsIntegration.platform,
          resourceType: 'page',
          resourceId: url || 'homepage',
          scope: 'meta',
          proposedBy: job.data.agentId || 'seo-agent',
          beforeState: { title },
          afterState: {
            metaTitle: optimization.metaTitle,
            metaDescription: optimization.metaDescription,
          },
          changeDescription: `SEO-optimized meta tags for "${url || 'page'}" targeting ${targetKeywords.length} keywords`,
          correlationId: job.id,
        });
      }
    } catch (e) {
      console.warn('Failed to propose CMS change:', (e as Error).message);
    }

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
