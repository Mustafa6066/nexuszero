/**
 * Rate Limit Tracker — Tracks rate limit usage across all connectors
 * and provides warnings when approaching limits.
 */

import { eq, and } from 'drizzle-orm';
import { getDb, integrations } from '@nexuszero/db';
import type { Platform, RateLimitInfo } from '@nexuszero/shared';

/** Update rate limit info for an integration */
export async function updateRateLimitInfo(
  tenantId: string,
  platform: Platform,
  rateLimitInfo: RateLimitInfo,
): Promise<void> {
  const db = getDb();
  await db.update(integrations)
    .set({
      rateLimitRemaining: rateLimitInfo.remaining,
      rateLimitResetAt: rateLimitInfo.resetsAt,
      updatedAt: new Date(),
    })
    .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, platform)));
}

/** Check if a platform is near its rate limit */
export async function isNearRateLimit(
  tenantId: string,
  platform: Platform,
  threshold = 0.1,
): Promise<boolean> {
  const db = getDb();
  const result = await db
    .select({
      remaining: integrations.rateLimitRemaining,
      rateLimitResetAt: integrations.rateLimitResetAt,
    })
    .from(integrations)
    .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, platform)))
    .limit(1);

  if (result.length === 0 || result[0]!.remaining === null) return false;

  // Use threshold-based check: near limit when remaining is below threshold ratio
  const remaining = result[0]!.remaining;
  const absoluteMinimum = Math.max(10, Math.ceil(threshold * 100));
  return remaining < absoluteMinimum;
}
