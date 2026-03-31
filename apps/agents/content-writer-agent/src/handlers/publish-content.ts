import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, contentDrafts, integrations } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { proposeCmsChange } from '@nexuszero/queue';
import { publishAgentSignal } from '@nexuszero/queue';

export class PublishContentHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;
    const draftId = input.draftId as string;

    if (!draftId) return { error: 'draftId is required' };

    const [draft] = await withTenantDb(tenantId, async (db) =>
      db.select().from(contentDrafts)
        .where(and(eq(contentDrafts.tenantId, tenantId), eq(contentDrafts.id, draftId)))
        .limit(1),
    );

    if (!draft) return { error: `Draft not found: ${draftId}` };
    if (draft.status !== 'approved') return { error: 'Draft must be approved before publishing' };

    // Find the first active CMS integration for this tenant
    const [cmsIntegration] = await withTenantDb(tenantId, async (db) =>
      db.select().from(integrations)
        .where(and(eq(integrations.tenantId, tenantId), eq(integrations.status, 'active')))
        .limit(1),
    );

    if (!cmsIntegration) return { error: 'No active CMS integration found' };

    // Propose CMS change using existing workflow
    const { changeId } = await proposeCmsChange({
      tenantId,
      integrationId: cmsIntegration.id,
      platform: cmsIntegration.platform,
      resourceType: 'page',
      resourceId: draftId,
      scope: 'content',
      proposedBy: 'content-writer',
      afterState: { title: draft.title, content: draft.content, type: draft.type },
      changeDescription: `Publish ${draft.type}: "${draft.title}"`,
    });

    await withTenantDb(tenantId, async (db) =>
      db.update(contentDrafts)
        .set({ status: 'published', publishedAt: new Date(), cmsChangeId: changeId })
        .where(eq(contentDrafts.id, draftId)),
    );

    await publishAgentSignal({
      tenantId, type: 'content.published', agentId: 'content-writer',
      data: { draftId, cmsChangeId: changeId, type: draft.type }, priority: 'medium', confidence: 1.0,
    });

    return { draftId, cmsChangeId: changeId, published: true };
  }
}
