// ---------------------------------------------------------------------------
// Plan Approval — human-in-the-loop workflow for agent actions
//
// Agents request approval for high-risk actions. The system blocks execution
// until a human approves or the request expires (24h default).
// ---------------------------------------------------------------------------

import { getDb, planApprovals } from '@nexuszero/db';
import { eq, and, lt, sql } from 'drizzle-orm';
import { getRedisConnection } from './bullmq-client.js';

/** Default expiry: 24 hours */
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

const APPROVAL_WAIT_KEY = 'approval:waiting';

export interface ApprovalRequest {
  tenantId: string;
  agentType: string;
  taskId: string;
  title: string;
  description: string;
  actionType: string;
  planData?: Record<string, unknown>;
  correlationId?: string;
  expiryMs?: number;
}

export interface ApprovalResult {
  approved: boolean;
  reviewedBy?: string;
  reviewNotes?: string;
  expired?: boolean;
}

/**
 * Create an approval request and block until it's resolved.
 * Returns the approval result when a human acts or the request expires.
 */
export async function requestApproval(req: ApprovalRequest): Promise<ApprovalResult> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + (req.expiryMs ?? DEFAULT_EXPIRY_MS));

  const [inserted] = await db.insert(planApprovals).values({
    tenantId: req.tenantId,
    agentType: req.agentType,
    taskId: req.taskId,
    title: req.title,
    description: req.description,
    actionType: req.actionType,
    planData: req.planData ?? {},
    status: 'pending',
    expiresAt,
    correlationId: req.correlationId,
  }).returning();

  if (!inserted) {
    return { approved: false };
  }

  // Publish to Redis pub/sub so dashboard gets notified
  try {
    const redis = getRedisConnection();
    await redis.publish(
      `${APPROVAL_WAIT_KEY}:${req.tenantId}`,
      JSON.stringify({ id: inserted.id, ...req }),
    );
  } catch {
    // Non-critical
  }

  // Poll for resolution (up to expiry)
  return pollForResolution(inserted.id, expiresAt);
}

/**
 * Approve a pending request.
 */
export async function approveRequest(
  approvalId: string,
  reviewedBy: string,
  notes?: string,
): Promise<boolean> {
  const db = getDb();
  const now = new Date();

  const result = await db.update(planApprovals)
    .set({
      status: 'approved',
      reviewedBy,
      reviewNotes: notes,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(planApprovals.id, approvalId),
      eq(planApprovals.status, 'pending'),
    ))
    .returning();

  if (result.length > 0) {
    // Notify waiting agent via Redis
    try {
      const redis = getRedisConnection();
      await redis.set(`approval:result:${approvalId}`, 'approved', 'EX', 3600);
    } catch {
      // Non-critical
    }
    return true;
  }
  return false;
}

/**
 * Reject a pending request.
 */
export async function rejectRequest(
  approvalId: string,
  reviewedBy: string,
  notes?: string,
): Promise<boolean> {
  const db = getDb();
  const now = new Date();

  const result = await db.update(planApprovals)
    .set({
      status: 'rejected',
      reviewedBy,
      reviewNotes: notes,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(planApprovals.id, approvalId),
      eq(planApprovals.status, 'pending'),
    ))
    .returning();

  if (result.length > 0) {
    try {
      const redis = getRedisConnection();
      await redis.set(`approval:result:${approvalId}`, 'rejected', 'EX', 3600);
    } catch {
      // Non-critical
    }
    return true;
  }
  return false;
}

/**
 * Get pending approvals for a tenant.
 */
export async function getPendingApprovals(tenantId: string) {
  const db = getDb();
  return db.select()
    .from(planApprovals)
    .where(and(
      eq(planApprovals.tenantId, tenantId),
      eq(planApprovals.status, 'pending'),
    ))
    .orderBy(planApprovals.createdAt);
}

/**
 * Expire old pending approvals. Call from a cron job.
 */
export async function expireOldApprovals(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const expired = await db.update(planApprovals)
    .set({
      status: 'expired',
      updatedAt: now,
    })
    .where(and(
      eq(planApprovals.status, 'pending'),
      lt(planApprovals.expiresAt, now),
    ))
    .returning();

  // Notify via Redis for each expired
  try {
    const redis = getRedisConnection();
    for (const approval of expired) {
      await redis.set(`approval:result:${approval.id}`, 'expired', 'EX', 3600);
    }
  } catch {
    // Non-critical
  }

  return expired.length;
}

async function pollForResolution(
  approvalId: string,
  expiresAt: Date,
): Promise<ApprovalResult> {
  const pollInterval = 5_000; // Check every 5 seconds

  while (Date.now() < expiresAt.getTime()) {
    // Check Redis first (faster than DB)
    try {
      const redis = getRedisConnection();
      const result = await redis.get(`approval:result:${approvalId}`);

      if (result === 'approved') {
        return { approved: true };
      }
      if (result === 'rejected') {
        return { approved: false };
      }
      if (result === 'expired') {
        return { approved: false, expired: true };
      }
    } catch {
      // Fall through to DB check
    }

    // Check DB as fallback
    const db = getDb();
    const [row] = await db.select()
      .from(planApprovals)
      .where(eq(planApprovals.id, approvalId))
      .limit(1);

    if (row && row.status !== 'pending') {
      return {
        approved: row.status === 'approved',
        reviewedBy: row.reviewedBy ?? undefined,
        reviewNotes: row.reviewNotes ?? undefined,
        expired: row.status === 'expired',
      };
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Expired
  return { approved: false, expired: true };
}
