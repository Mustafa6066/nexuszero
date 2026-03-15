import { withTenantDb, cmsChanges, integrations } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { publishAgentSignal } from '@nexuszero/queue';

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
 *
 * Uses the tenant's autonomy_mode setting from their integration config.
 */
export async function proposeChange(req: CmsChangeRequest): Promise<{
  changeId: string;
  status: 'proposed' | 'auto_approved' | 'pushed';
  autoApproved: boolean;
}> {
  // 1. Determine autonomy mode from the integration
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

  // 2. Determine if this change can be auto-approved
  const isSafeScope = SAFE_SCOPES.includes(req.scope);
  const autoApprove = (autonomyMode === 'autonomous') ||
    (autonomyMode === 'guardrailed' && isSafeScope);

  // 3. Record the change
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

  // 4. Signal the change
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

/**
 * Approve a pending CMS change.
 */
export async function approveChange(
  tenantId: string,
  changeId: string,
  approvedBy: string,
): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.update(cmsChanges)
      .set({
        status: 'approved',
        approvedBy,
        updatedAt: new Date(),
      })
      .where(and(
        eq(cmsChanges.id, changeId),
        eq(cmsChanges.tenantId, tenantId),
        eq(cmsChanges.status, 'proposed'),
      ));
  });
}

/**
 * Reject a pending CMS change.
 */
export async function rejectChange(
  tenantId: string,
  changeId: string,
  rejectedBy: string,
): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.update(cmsChanges)
      .set({
        status: 'rejected',
        approvedBy: rejectedBy,
        updatedAt: new Date(),
      })
      .where(and(
        eq(cmsChanges.id, changeId),
        eq(cmsChanges.tenantId, tenantId),
        eq(cmsChanges.status, 'proposed'),
      ));
  });
}

/**
 * Mark a change as pushed to CMS.
 */
export async function markPushed(
  tenantId: string,
  changeId: string,
): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.update(cmsChanges)
      .set({
        status: 'pushed',
        pushedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(cmsChanges.id, changeId),
        eq(cmsChanges.tenantId, tenantId),
      ));
  });
}

/**
 * Mark a change as failed.
 */
export async function markFailed(
  tenantId: string,
  changeId: string,
  error: string,
): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.update(cmsChanges)
      .set({
        status: 'failed',
        error,
        updatedAt: new Date(),
      })
      .where(and(
        eq(cmsChanges.id, changeId),
        eq(cmsChanges.tenantId, tenantId),
      ));
  });
}
