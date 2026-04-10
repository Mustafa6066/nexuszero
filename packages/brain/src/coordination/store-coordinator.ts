import { createLogger } from '@nexuszero/shared';
import { getDb, agents } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { getRedisConnection } from '@nexuszero/queue';

// ---------------------------------------------------------------------------
// Store Coordinator — Phase 5
//
// Ensures consistency across PostgreSQL (truth), Redis (state), ClickHouse
// (analytics), and Kafka (signals). Detects drift between stores and
// auto-repairs by reconciling Redis state from PostgreSQL source of truth.
//
// Inspired by Repowise's AtomicStorageCoordinator (SQL + vector + graph
// transactional flush).
// ---------------------------------------------------------------------------

const logger = createLogger('brain:store-coordinator');

export interface StoreDriftReport {
  tenantId: string;
  drifts: StoreDrift[];
  checkedAt: Date;
  isHealthy: boolean;
}

export interface StoreDrift {
  store: 'redis' | 'clickhouse';
  entity: string;
  pgValue: unknown;
  storeValue: unknown;
  severity: 'low' | 'medium' | 'high';
}

export class StoreCoordinator {
  /** Run a full consistency check for a tenant */
  async checkConsistency(tenantId: string): Promise<StoreDriftReport> {
    const drifts: StoreDrift[] = [];

    // Check agent state consistency between PG and Redis
    const agentDrifts = await this.checkAgentStateDrift(tenantId);
    drifts.push(...agentDrifts);

    const report: StoreDriftReport = {
      tenantId,
      drifts,
      checkedAt: new Date(),
      isHealthy: drifts.length === 0,
    };

    // Store report in Redis for dashboard access
    const redis = getRedisConnection();
    await redis.setex(
      `brain:store-health:${tenantId}`,
      3_600,
      JSON.stringify(report),
    );

    if (drifts.length > 0) {
      logger.warn('Store drift detected', {
        tenantId,
        driftCount: drifts.length,
        highSeverity: drifts.filter(d => d.severity === 'high').length,
      });
    }

    return report;
  }

  /** Auto-repair: reconcile Redis state from PostgreSQL source of truth */
  async repair(tenantId: string, report: StoreDriftReport): Promise<number> {
    let repaired = 0;

    for (const drift of report.drifts) {
      if (drift.store === 'redis') {
        const success = await this.repairRedisDrift(tenantId, drift);
        if (success) repaired++;
      }
    }

    logger.info('Store repair complete', { tenantId, repaired, total: report.drifts.length });
    return repaired;
  }

  /** Check and repair in one step */
  async checkAndRepair(tenantId: string): Promise<StoreDriftReport> {
    const report = await this.checkConsistency(tenantId);

    if (!report.isHealthy) {
      await this.repair(tenantId, report);
    }

    return report;
  }

  // ---------- Agent state drift detection ----------

  private async checkAgentStateDrift(tenantId: string): Promise<StoreDrift[]> {
    const drifts: StoreDrift[] = [];
    const db = getDb();
    const redis = getRedisConnection();

    // Get agents from PostgreSQL (source of truth)
    const pgAgents = await db.select({
      id: agents.id,
      type: agents.type,
      status: agents.status,
    })
      .from(agents)
      .where(eq(agents.tenantId, tenantId));

    // Compare with Redis state
    for (const agent of pgAgents) {
      const redisKey = `agent:${agent.type}:state:${tenantId}`;
      const redisState = await redis.get(redisKey);

      if (redisState) {
        try {
          const parsed = JSON.parse(redisState);
          const redisStatus = typeof parsed.status === 'string' ? parsed.status : 'unknown';
          if (redisStatus !== agent.status) {
            drifts.push({
              store: 'redis',
              entity: `agent:${agent.type}:status`,
              pgValue: agent.status,
              storeValue: redisStatus,
              severity: agent.status === 'processing' && (redisStatus === 'offline' || redisStatus === 'error' || redisStatus === 'inactive')
                ? 'high'
                : 'medium',
            });
          }
        } catch {
          // Corrupted Redis data — flag as drift
          drifts.push({
            store: 'redis',
            entity: `agent:${agent.type}:state`,
            pgValue: agent.status,
            storeValue: 'corrupted',
            severity: 'high',
          });
        }
      } else if (agent.status !== 'offline') {
        // Non-offline agent with no Redis state — drift
        drifts.push({
          store: 'redis',
          entity: `agent:${agent.type}:state`,
          pgValue: agent.status,
          storeValue: null,
          severity: 'medium',
        });
      }
    }

    return drifts;
  }

  private async repairRedisDrift(tenantId: string, drift: StoreDrift): Promise<boolean> {
    const redis = getRedisConnection();

    try {
      // Entity format: "agent:{type}:status" or "agent:{type}:state"
      const parts = drift.entity.split(':');
      if (parts[0] !== 'agent' || parts.length < 3) return false;

      const agentType = parts[1]!;
      const redisKey = `agent:${agentType}:state:${tenantId}`;

      // Reset Redis state from PG value
      await redis.setex(redisKey, 3_600, JSON.stringify({
        status: drift.pgValue,
        repairedAt: new Date().toISOString(),
        source: 'store-coordinator',
      }));

      logger.info('Redis drift repaired from PostgreSQL', {
        tenantId,
        entity: drift.entity,
        from: drift.storeValue,
        to: drift.pgValue,
      });

      return true;
    } catch (err) {
      logger.error('Failed to repair drift', { err, tenantId, entity: drift.entity });
      return false;
    }
  }
}
