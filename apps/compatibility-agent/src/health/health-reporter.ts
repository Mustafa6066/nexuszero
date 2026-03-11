/**
 * Health Reporter — Aggregates health data into summaries for the dashboard.
 */

import { eq, and, ne, gte } from 'drizzle-orm';
import { getDb, integrations, integrationHealth } from '@nexuszero/db';
import type { Platform, IntegrationHealthSummary } from '@nexuszero/shared';

/** Get health summary for a tenant */
export async function getHealthSummary(tenantId: string): Promise<IntegrationHealthSummary> {
  const db = getDb();
  const tenantIntegrations = await db
    .select()
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId));

  const connectedPlatforms: Platform[] = [];
  let overallScore = 0;
  const platformHealth: Array<{
    platform: Platform;
    status: string;
    healthScore: number;
    lastChecked: Date | null;
  }> = [];

  for (const integration of tenantIntegrations) {
    const platform = integration.platform as Platform;
    connectedPlatforms.push(platform);

    platformHealth.push({
      platform,
      status: integration.status,
      healthScore: integration.healthScore ?? 100,
      lastChecked: integration.updatedAt,
    });

    overallScore += (integration.healthScore ?? 100);
  }

  return {
    tenantId,
    connectedPlatforms,
    overallHealth: tenantIntegrations.length > 0
      ? Math.round(overallScore / tenantIntegrations.length)
      : 100,
    platformHealth,
    lastSweepAt: new Date(),
  };
}

/** Get recent health check logs for an integration */
export async function getHealthLogs(
  tenantId: string,
  platform: Platform,
  limit = 50,
) {
  const db = getDb();
  const [integration] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, platform)))
    .limit(1);

  if (!integration) return [];

  return db
    .select()
    .from(integrationHealth)
    .where(eq(integrationHealth.integrationId, integration.id))
    .orderBy(integrationHealth.checkedAt)
    .limit(limit);
}

/** Get count of degraded integrations for a tenant */
export async function getDegradedCount(tenantId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select()
    .from(integrations)
    .where(and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.status, 'degraded'),
    ));

  return result.length;
}
