/**
 * Healing Orchestrator — Coordinates the full self-healing pipeline:
 * 1. Detect degraded / failed integrations
 * 2. Attempt auto-reconnection
 * 3. Reset circuit breakers on success
 * 4. Find fallbacks for persistent failures
 * 5. Emit events for dashboard / alerting
 */

import { eq, and, inArray } from 'drizzle-orm';
import { getDb, integrations } from '@nexuszero/db';
import type { Platform, IntegrationStatus } from '@nexuszero/shared';
import { attemptReconnection, runReconnectionSweep } from './auto-reconnector.js';
import { resetCircuit, getTrippedCircuits } from './circuit-state-manager.js';
import { findFallback, type FallbackResult } from './fallback-manager.js';

export interface HealingReport {
  tenantId: string;
  reconnected: Platform[];
  fallbacks: FallbackResult[];
  stillFailed: Platform[];
  circuitsReset: Platform[];
  timestamp: Date;
}

/** Run a full healing cycle for one tenant */
export async function runHealingCycle(tenantId: string): Promise<HealingReport> {
  const reconnected: Platform[] = [];
  const fallbacks: FallbackResult[] = [];
  const stillFailed: Platform[] = [];

  // 1. Get all failing/degraded integrations
  const db = getDb();
  const unhealthy = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, tenantId),
        inArray(integrations.status, ['degraded', 'expired', 'reconnecting'] as const),
      ),
    );

  // 2. Attempt reconnection for each
  for (const integration of unhealthy) {
    const result = await attemptReconnection(
      integration.id,
      tenantId,
      integration.platform as Platform,
    );

    if (result.success) {
      reconnected.push(integration.platform as Platform);
      // Reset the circuit breaker on successful reconnection
      resetCircuit(integration.platform as Platform);
    } else {
      // 3. Try to find a fallback
      const fallback = await findFallback(tenantId, integration.platform as Platform);
      fallbacks.push(fallback);
      if (!fallback.available) {
        stillFailed.push(integration.platform as Platform);
      }
    }
  }

  // 4. Reset any tripped circuits that correspond to now-healthy platforms
  const tripped = getTrippedCircuits();
  const circuitsReset: Platform[] = [];
  for (const circuit of tripped) {
    if (reconnected.includes(circuit.platform)) {
      resetCircuit(circuit.platform);
      circuitsReset.push(circuit.platform);
    }
  }

  return {
    tenantId,
    reconnected,
    fallbacks,
    stillFailed,
    circuitsReset,
    timestamp: new Date(),
  };
}

/** Run healing sweep across all tenants with issues */
export async function runGlobalHealingSweep(): Promise<HealingReport[]> {
  // Get distinct tenants with unhealthy integrations
  const db = getDb();
  const unhealthyRows = await db
    .selectDistinct({ tenantId: integrations.tenantId })
    .from(integrations)
    .where(
      inArray(integrations.status, ['degraded', 'expired', 'reconnecting'] as const),
    );

  const reports: HealingReport[] = [];
  for (const row of unhealthyRows) {
    try {
      const report = await runHealingCycle(row.tenantId);
      reports.push(report);
    } catch (error) {
      console.error(`[healing] Failed healing cycle for tenant ${row.tenantId}:`, error);
    }
  }

  return reports;
}
