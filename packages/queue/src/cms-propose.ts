import { withTenantDb, cmsChanges, integrations } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { publishAgentSignal } from './producers.js';

export type CmsChangeScope = 'meta' | 'schema' | 'content' | 'script' | 'custom_code';

export interface CmsChangeRequest {
  tenantId: string;
  integrationId: string;
  platform: string;
  resourceType: string;
  resourceId: string;
  scope: CmsChangeScope;
  proposedBy: string;
  beforeState?: Record<string, unknown>;
  afterState: Record<string, unknown>;
  changeDescription: string;
  correlationId?: string;
}

/** Safe scopes that can be auto-approved in guardrailed mode */
const SAFE_SCOPES: CmsChangeScope[] = ['meta', 'schema', 'script'];

/**
 * CMS Gateway — autonomy-gated execution layer for CMS changes.
 *
 * Determines whether a proposed change should be:
 * 1. Auto-approved and pushed immediately (safe scope + guardrailed/autonomous mode)
 * 2. Queued for human approval (content changes or manual mode)
 */
export async function proposeCmsChange(req: CmsChangeRequest): Promise<{
  changeId: string;
  status: 'proposed' | 'auto_approved' | 'pushed';
  autoApproved: boolean;
}> {
  const integration = await withTenantDb(req.tenantId, async (db) => {
    const [i] = await db.select().from(integrations)
      .where(and(
        eq(integrations.id, req.integrationId),
        eq(integrations.tenantId, req.tenantId),
      ))
      .limit(1);
    return i;
  });

  const config = (integration?.config as Record<string, unknown>) || {};
  const autonomyMode = (config.autonomy_mode as string) || 'guardrailed';

  const isSafeScope = SAFE_SCOPES.includes(req.scope);
  const autoApprove = (autonomyMode === 'autonomous') ||
    (autonomyMode === 'guardrailed' && isSafeScope);

  const change = await withTenantDb(req.tenantId, async (db) => {
    const [c] = await db.insert(cmsChanges).values({
      tenantId: req.tenantId,
      integrationId: req.integrationId,
      platform: req.platform,
      resourceType: req.resourceType,
      resourceId: req.resourceId,
      scope: req.scope,
      status: autoApprove ? 'approved' : 'proposed',
      proposedBy: req.proposedBy,
      beforeState: req.beforeState,
      afterState: req.afterState,
      changeDescription: req.changeDescription,
      autoApproved: autoApprove,
    }).returning();
    return c!;
  });

  await publishAgentSignal({
    tenantId: req.tenantId,
    type: autoApprove ? 'cms.change_pushed' : 'cms.change_proposed',
    agentId: req.proposedBy,
    targetAgent: 'broadcast',
    data: {
      changeId: change.id,
      platform: req.platform,
      scope: req.scope,
      resourceType: req.resourceType,
      autoApproved: autoApprove,
    },
    priority: 'medium',
    confidence: 0.9,
    correlationId: req.correlationId || change.id,
  });

  return {
    changeId: change.id,
    status: autoApprove ? 'auto_approved' : 'proposed',
    autoApproved: autoApprove,
  };
}

export async function approveCmsChange(
  tenantId: string,
  changeId: string,
  approvedBy: string,
): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.update(cmsChanges)
      .set({ status: 'approved', approvedBy, updatedAt: new Date() })
      .where(and(
        eq(cmsChanges.id, changeId),
        eq(cmsChanges.tenantId, tenantId),
        eq(cmsChanges.status, 'proposed'),
      ));
  });

  await publishAgentSignal({
    tenantId,
    type: 'cms.change_pushed',
    agentId: approvedBy,
    targetAgent: 'broadcast',
    data: { changeId, approvedBy },
    priority: 'medium',
    confidence: 1.0,
    correlationId: changeId,
  });
}

export async function rejectCmsChange(
  tenantId: string,
  changeId: string,
  rejectedBy: string,
): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.update(cmsChanges)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(and(
        eq(cmsChanges.id, changeId),
        eq(cmsChanges.tenantId, tenantId),
        eq(cmsChanges.status, 'proposed'),
      ));
  });
}
