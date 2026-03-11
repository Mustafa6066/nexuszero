import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
import { withTenantDb, tenants } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { llmGenerateKeywords } from '../llm.js';

export class KeywordResearchHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    // Get tenant context
    const tenant = await withTenantDb(tenantId, async (db) => {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      return t;
    });

    const settings = (tenant?.settings || {}) as Record<string, any>;

    await job.updateProgress(30);

    const keywords = await llmGenerateKeywords({
      industry: settings.industry || input.industry || 'technology',
      domain: tenant?.domain || input.domain || '',
      existingKeywords: input.existingKeywords || [],
      competitors: input.competitors || [],
    });

    await job.updateProgress(80);

    // Group keywords by intent and priority
    const grouped = {
      highPriority: keywords.filter((k: any) => k.priority <= 2),
      mediumPriority: keywords.filter((k: any) => k.priority === 3),
      lowPriority: keywords.filter((k: any) => k.priority >= 4),
      transactional: keywords.filter((k: any) => k.intent === 'transactional'),
      informational: keywords.filter((k: any) => k.intent === 'informational'),
    };

    await job.updateProgress(100);

    return {
      keywords,
      grouped,
      totalKeywords: keywords.length,
      completedAt: new Date().toISOString(),
    };
  }
}
