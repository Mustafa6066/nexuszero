import { getDb, agentTasks, tenants } from '@nexuszero/db';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import { getRedisConnection } from '@nexuszero/queue';
import type {
  SignalSnapshot,
  AgentFleetState,
  OperatingPicture,
  IntegrationHealth,
  RecentOutcome,
  StrategyDecisionRecord,
} from '../types.js';

// ---------------------------------------------------------------------------
// Tenant Context Builder — Perception Layer
//
// Synthesizes per-tenant OperatingPicture from signals, fleet state, recent
// outcomes, integration health, and active strategies. This is the complete
// operational snapshot that reasoning and planning consume.
// ---------------------------------------------------------------------------

const RECENT_OUTCOME_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_RECENT_OUTCOMES = 50;

export class TenantContextBuilder {
  /** Build a complete OperatingPicture for a tenant */
  async build(
    tenantId: string,
    signals: SignalSnapshot,
    fleet: AgentFleetState,
  ): Promise<OperatingPicture> {
    const [integrations, recentOutcomes, strategies, kpiSnapshot] = await Promise.all([
      this.getIntegrationHealth(tenantId),
      this.getRecentOutcomes(tenantId),
      this.getActiveStrategies(tenantId),
      this.getKpiSnapshot(tenantId),
    ]);

    return {
      tenantId,
      signals,
      fleet,
      integrations,
      recentOutcomes,
      activeStrategies: strategies,
      kpiSnapshot,
      generatedAt: new Date(),
    };
  }

  private async getIntegrationHealth(tenantId: string): Promise<IntegrationHealth[]> {
    const redis = getRedisConnection();
    const key = `tenant:${tenantId}:integrations:health`;
    const cached = await redis.get(key);

    if (cached) {
      try {
        return JSON.parse(cached) as IntegrationHealth[];
      } catch {
        // Fall through to DB query
      }
    }

    // Integration health is tracked by the compatibility agent — read from DB
    const db = getDb();
    try {
      const rows = await db.execute(sql`
        SELECT id, platform, status, error_rate, last_sync_at
        FROM integrations
        WHERE tenant_id = ${tenantId}
      `);

      const integrationRows = Array.isArray(rows)
        ? rows
        : Array.from(rows as Iterable<Record<string, unknown>>);

      const health: IntegrationHealth[] = integrationRows.map((row: Record<string, unknown>) => ({
        integrationId: row.id as string,
        platform: row.platform as string,
        status: (row.status as IntegrationHealth['status']) || 'disconnected',
        errorRate: (row.error_rate as number) || 0,
        lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at as string) : null,
      }));

      // Cache for 60s
      await redis.setex(key, 60, JSON.stringify(health));
      return health;
    } catch {
      return [];
    }
  }

  private async getRecentOutcomes(tenantId: string): Promise<RecentOutcome[]> {
    const db = getDb();
    const cutoff = new Date(Date.now() - RECENT_OUTCOME_WINDOW_MS);

    const rows = await db.select({
      id: agentTasks.id,
      type: agentTasks.type,
      status: agentTasks.status,
      processingTimeMs: agentTasks.processingTimeMs,
      completedAt: agentTasks.completedAt,
      output: agentTasks.output,
    })
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.tenantId, tenantId),
          inArray(agentTasks.status, ['completed', 'failed']),
          gte(agentTasks.completedAt, cutoff),
        ),
      )
      .orderBy(desc(agentTasks.completedAt))
      .limit(MAX_RECENT_OUTCOMES);

    return rows.map(row => ({
      taskId: row.id,
      taskType: row.type,
      agentType: this.inferAgentType(row.type),
      status: row.status as 'completed' | 'failed',
      durationMs: row.processingTimeMs ?? 0,
      completedAt: row.completedAt ?? new Date(),
      impact: row.output as Record<string, unknown> | undefined,
    }));
  }

  private async getActiveStrategies(tenantId: string): Promise<StrategyDecisionRecord[]> {
    const redis = getRedisConnection();
    const key = `brain:strategies:${tenantId}`;
    const cached = await redis.get(key);

    if (cached) {
      try {
        return JSON.parse(cached) as StrategyDecisionRecord[];
      } catch {
        // Fall through
      }
    }

    // Strategy decisions are stored by the Brain itself — return empty for now
    // Will be populated once decision-records intelligence layer writes them
    return [];
  }

  private async getKpiSnapshot(tenantId: string): Promise<Record<string, number>> {
    const redis = getRedisConnection();
    const key = `tenant:${tenantId}:kpi:latest`;
    const cached = await redis.get(key);

    if (cached) {
      try {
        return JSON.parse(cached) as Record<string, number>;
      } catch {
        return {};
      }
    }

    return {};
  }

  private inferAgentType(taskType: string): string {
    const prefix = taskType.split('_')[0];
    const typeMap: Record<string, string> = {
      seo: 'seo',
      keyword: 'seo',
      content: 'content-writer',
      write: 'content-writer',
      ad: 'ad',
      optimize: 'ad',
      manage: 'ad',
      aeo: 'aeo',
      scan: 'aeo',
      data: 'data-nexus',
      daily: 'data-nexus',
      forecast: 'data-nexus',
      social: 'social',
      reddit: 'reddit',
      geo: 'geo',
      sales: 'sales-pipeline',
      lead: 'sales-pipeline',
      outbound: 'outbound',
      sequence: 'outbound',
      finance: 'finance',
      cfo: 'finance',
      podcast: 'podcast',
      compatibility: 'compatibility',
      tech: 'compatibility',
      oauth: 'compatibility',
    };
    return typeMap[prefix ?? ''] ?? 'unknown';
  }
}
