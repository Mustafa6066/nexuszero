/**
 * Health Scorer — Computes a rolling health score from recent health check logs.
 * Uses a weighted average of the last N checks, with more recent checks weighted higher.
 */

import { eq, desc } from 'drizzle-orm';
import { getDb, integrationHealth } from '@nexuszero/db';

const MAX_CHECKS_FOR_SCORE = 10;

/** Compute health score (0-1) from recent health check logs */
export async function computeHealthScore(integrationId: string): Promise<number> {
  const db = getDb();
  const recentChecks = await db
    .select()
    .from(integrationHealth)
    .where(eq(integrationHealth.integrationId, integrationId))
    .orderBy(desc(integrationHealth.checkedAt))
    .limit(MAX_CHECKS_FOR_SCORE);

  if (recentChecks.length === 0) return 1; // No checks yet = assume healthy

  let weightedSum = 0;
  let weightTotal = 0;

  for (let i = 0; i < recentChecks.length; i++) {
    const check = recentChecks[i]!;
    // More recent checks get higher weight (exponential decay)
    const weight = Math.pow(0.8, i);
    const value = check.status === 'pass' ? 1 : check.status === 'warn' ? 0.5 : 0;

    weightedSum += value * weight;
    weightTotal += weight;
  }

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/** Compute average latency from recent checks */
export async function computeAverageLatency(integrationId: string): Promise<number> {
  const db = getDb();
  const recentChecks = await db
    .select({ latencyMs: integrationHealth.latencyMs })
    .from(integrationHealth)
    .where(eq(integrationHealth.integrationId, integrationId))
    .orderBy(desc(integrationHealth.checkedAt))
    .limit(MAX_CHECKS_FOR_SCORE);

  if (recentChecks.length === 0) return 0;

  const validLatencies = recentChecks
    .map((c) => c.latencyMs)
    .filter((l): l is number => l !== null && l > 0);

  if (validLatencies.length === 0) return 0;

  return validLatencies.reduce((sum, l) => sum + l, 0) / validLatencies.length;
}
