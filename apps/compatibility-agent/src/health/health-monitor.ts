/**
 * Health Monitor — Periodic health sweep across all integrations.
 * Runs every 15 minutes via cron, checks each integration's connectivity,
 * and updates health scores in the database.
 */

import { eq, and, ne } from 'drizzle-orm';
import { getDb, integrations, integrationHealth } from '@nexuszero/db';
import type { Platform, HealthCheckResult } from '@nexuszero/shared';
import { getConnector } from '../connectors/connector-registry.js';
import { retrieveTokens } from '../oauth/token-vault.js';
import { computeHealthScore } from './health-scorer.js';
import { getHealthThresholds } from '../config/health-thresholds.js';

export interface HealthSweepResult {
  total: number;
  healthy: number;
  degraded: number;
  failed: number;
  duration: number;
}

/** Run a health sweep across all active integrations */
export async function runHealthSweep(): Promise<HealthSweepResult> {
  const start = Date.now();
  const db = getDb();

  // Get all active integrations
  const activeIntegrations = await db
    .select()
    .from(integrations)
    .where(ne(integrations.status, 'disconnected'));

  let healthy = 0;
  let degraded = 0;
  let failed = 0;

  // Process in batches of 10
  const batchSize = 10;
  for (let i = 0; i < activeIntegrations.length; i += batchSize) {
    const batch = activeIntegrations.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((integration) => checkIntegration(integration)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const status = result.value;
        if (status === 'connected') healthy++;
        else if (status === 'degraded') degraded++;
        else failed++;
      } else {
        failed++;
      }
    }
  }

  return {
    total: activeIntegrations.length,
    healthy,
    degraded,
    failed,
    duration: Date.now() - start,
  };
}

/** Check a single integration's health */
async function checkIntegration(
  integration: typeof integrations.$inferSelect,
): Promise<'connected' | 'degraded' | 'disconnected'> {
  const platform = integration.platform as Platform;
  const connector = getConnector(platform);

  const tokens = await retrieveTokens(integration.id);
  if (!tokens) {
    await updateIntegrationStatus(integration.id, 'disconnected', 0, 'No tokens found');
    return 'disconnected';
  }

  const healthResult = await connector.healthCheck(tokens.accessToken);

  // Log the health check
  const db = getDb();
  await db.insert(integrationHealth).values({
    integrationId: integration.id,
    tenantId: integration.tenantId,
    checkType: 'ping',
    status: healthResult.healthy ? 'pass' : 'fail',
    latencyMs: healthResult.latencyMs,
    details: {
      apiVersion: healthResult.apiVersion,
      error: healthResult.error,
      scopesValid: healthResult.scopesValid,
    },
  });

  // Compute health score from recent checks
  const score = await computeHealthScore(integration.id);
  const thresholds = getHealthThresholds(platform);
  const scorePct = score * 100;

  let status: 'connected' | 'degraded' | 'disconnected';
  if (scorePct >= thresholds.degradedThreshold) status = 'connected';
  else if (scorePct >= thresholds.disconnectedThreshold) status = 'degraded';
  else status = 'disconnected';

  await updateIntegrationStatus(
    integration.id,
    status,
    Math.round(score * 100),
    healthResult.error,
    healthResult.latencyMs,
  );

  return status;
}

async function updateIntegrationStatus(
  integrationId: string,
  status: string,
  healthScore: number,
  error?: string,
  latencyMs?: number,
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    healthScore,
    updatedAt: new Date(),
  };

  if (status === 'connected') {
    updates.lastSuccessfulCall = new Date();
    updates.errorCount = 0;
  }
  if (error) {
    updates.lastError = error;
  }
  if (latencyMs !== undefined) {
    updates.latencyP95Ms = latencyMs;
  }

  const db = getDb();
  await db.update(integrations)
    .set(updates)
    .where(eq(integrations.id, integrationId));
}

/** Check health for a specific tenant's integrations */
export async function checkTenantHealth(tenantId: string): Promise<HealthCheckResult[]> {
  const db = getDb();
  const tenantIntegrations = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.tenantId, tenantId), ne(integrations.status, 'disconnected')));

  const results: HealthCheckResult[] = [];
  for (const integration of tenantIntegrations) {
    const platform = integration.platform as Platform;
    const connector = getConnector(platform);
    const tokens = await retrieveTokens(integration.id);
    if (tokens) {
      results.push(await connector.healthCheck(tokens.accessToken));
    }
  }

  return results;
}
