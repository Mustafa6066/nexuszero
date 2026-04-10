import { getDb, agentTasks } from '@nexuszero/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getRedisConnection } from '@nexuszero/queue';
import type { StaleItem } from '../types.js';

// ---------------------------------------------------------------------------
// Stale Strategy Detector — Intelligence Layer
//
// Identifies unused integrations, dormant agent capabilities, and strategies
// that haven't produced outcomes. Inspired by Repowise's dead code detection
// with confidence-scored, conservative approach.
// ---------------------------------------------------------------------------

const CACHE_KEY = (tenantId: string) => `brain:intelligence:stale:${tenantId}`;
const CACHE_TTL = 86_400; // 24h
const STALE_THRESHOLD_DAYS = 30;

export class StaleDetector {
  /** Scan for stale items across strategies, integrations, and capabilities */
  async detect(tenantId: string): Promise<StaleItem[]> {
    const redis = getRedisConnection();
    const cached = await redis.get(CACHE_KEY(tenantId));
    if (cached) {
      try {
        return JSON.parse(cached) as StaleItem[];
      } catch {
        // Rebuild
      }
    }

    const [staleCapabilities, staleIntegrations] = await Promise.all([
      this.detectStaleCapabilities(tenantId),
      this.detectStaleIntegrations(tenantId),
    ]);

    const allStale = [...staleCapabilities, ...staleIntegrations];

    if (allStale.length > 0) {
      await redis.setex(CACHE_KEY(tenantId), CACHE_TTL, JSON.stringify(allStale));
    }

    return allStale;
  }

  /** Detect agent task types that haven't been used in 30+ days */
  private async detectStaleCapabilities(tenantId: string): Promise<StaleItem[]> {
    const db = getDb();
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    // Get all task types used by this tenant, with their last execution date
    const rows = await db.select({
      type: agentTasks.type,
      lastExecuted: sql<string>`max(${agentTasks.completedAt})`,
      totalTasks: sql<number>`cast(count(*) as int)`,
    })
      .from(agentTasks)
      .where(eq(agentTasks.tenantId, tenantId))
      .groupBy(agentTasks.type);

    const stale: StaleItem[] = [];
    const now = Date.now();

    for (const row of rows) {
      if (!row.lastExecuted) continue;

      const lastActive = new Date(row.lastExecuted);
      const daysSince = (now - lastActive.getTime()) / (24 * 60 * 60 * 1000);

      if (daysSince > STALE_THRESHOLD_DAYS) {
        stale.push({
          type: 'agent_capability',
          id: row.type,
          name: row.type,
          lastActiveAt: lastActive,
          daysSinceActive: Math.round(daysSince),
          recommendation: row.totalTasks > 10
            ? `Task type "${row.type}" was active (${row.totalTasks} executions) but unused for ${Math.round(daysSince)} days — verify if still needed`
            : `Task type "${row.type}" has minimal usage (${row.totalTasks} executions) and is inactive — consider removing from strategy`,
        });
      }
    }

    return stale;
  }

  /** Detect integrations that haven't been used or synced recently */
  private async detectStaleIntegrations(tenantId: string): Promise<StaleItem[]> {
    const redis = getRedisConnection();
    const healthKey = `tenant:${tenantId}:integrations:health`;
    const cached = await redis.get(healthKey);

    if (!cached) return [];

    let integrations: Array<{ integrationId: string; platform: string; lastSyncAt: string | null }>;
    try {
      integrations = JSON.parse(cached);
    } catch {
      return [];
    }

    const stale: StaleItem[] = [];
    const now = Date.now();

    for (const integration of integrations) {
      if (!integration.lastSyncAt) {
        stale.push({
          type: 'integration',
          id: integration.integrationId,
          name: integration.platform,
          lastActiveAt: new Date(0),
          daysSinceActive: -1,
          recommendation: `Integration "${integration.platform}" has never synced — verify connection or remove`,
        });
        continue;
      }

      const lastSync = new Date(integration.lastSyncAt);
      const daysSince = (now - lastSync.getTime()) / (24 * 60 * 60 * 1000);

      if (daysSince > STALE_THRESHOLD_DAYS) {
        stale.push({
          type: 'integration',
          id: integration.integrationId,
          name: integration.platform,
          lastActiveAt: lastSync,
          daysSinceActive: Math.round(daysSince),
          recommendation: `Integration "${integration.platform}" last synced ${Math.round(daysSince)} days ago — check if still needed or reconnect`,
        });
      }
    }

    return stale;
  }
}
