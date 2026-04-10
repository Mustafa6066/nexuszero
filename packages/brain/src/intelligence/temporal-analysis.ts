import { getDb, agentTasks } from '@nexuszero/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getRedisConnection } from '@nexuszero/queue';
import type { TaskHotspot } from '../types.js';

// ---------------------------------------------------------------------------
// Temporal / Historical Intelligence — Layer 2
//
// Computes task hotspot scores using exponential decay (inspired by Repowise's
// temporal_hotspot_score), tracks handler churn, and maintains performance
// trend windows (7d / 30d / 90d).
//
// Hotspot formula: score = Σ exp(-ln2 · age_days / 180) · failure_weight
// ---------------------------------------------------------------------------

const CACHE_KEY = (tenantId: string) => `brain:intelligence:temporal:${tenantId}`;
const CACHE_TTL = 3_600; // 1 hour
const DECAY_HALF_LIFE_DAYS = 180;
const LN2 = Math.log(2);

export interface TemporalSnapshot {
  hotspots: TaskHotspot[];
  performanceWindows: PerformanceWindow[];
  handlerChurn: HandlerChurn[];
  generatedAt: Date;
}

export interface PerformanceWindow {
  agentType: string;
  window: '7d' | '30d' | '90d';
  successRate: number;
  avgDurationMs: number;
  totalTasks: number;
  failedTasks: number;
}

export interface HandlerChurn {
  taskType: string;
  retriesLast30d: number;
  failuresLast30d: number;
  trend: 'improving' | 'stable' | 'worsening';
}

export class TemporalAnalysis {
  /** Compute full temporal snapshot for a tenant (runs hourly) */
  async analyze(tenantId: string): Promise<TemporalSnapshot> {
    const redis = getRedisConnection();
    const cached = await redis.get(CACHE_KEY(tenantId));
    if (cached) {
      try {
        return JSON.parse(cached) as TemporalSnapshot;
      } catch {
        // Rebuild
      }
    }

    const [hotspots, performanceWindows, handlerChurn] = await Promise.all([
      this.computeHotspots(tenantId),
      this.computePerformanceWindows(tenantId),
      this.computeHandlerChurn(tenantId),
    ]);

    const snapshot: TemporalSnapshot = {
      hotspots,
      performanceWindows,
      handlerChurn,
      generatedAt: new Date(),
    };

    await redis.setex(CACHE_KEY(tenantId), CACHE_TTL, JSON.stringify(snapshot));
    return snapshot;
  }

  /**
   * Compute task hotspot scores using exponential decay.
   * Tasks that failed recently score higher than tasks that failed long ago.
   */
  private async computeHotspots(tenantId: string): Promise<TaskHotspot[]> {
    const db = getDb();
    const cutoff = new Date(Date.now() - DECAY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000);

    const rows = await db.select({
      type: agentTasks.type,
      status: agentTasks.status,
      completedAt: agentTasks.completedAt,
      attempts: agentTasks.attempts,
    })
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.tenantId, tenantId),
          gte(agentTasks.createdAt, cutoff),
        ),
      );

    // Group by task type and compute hotspot score
    const typeGroups = new Map<string, { failures: Array<{ age: number; attempts: number }>; total: number }>();

    const now = Date.now();
    for (const row of rows) {
      const group = typeGroups.get(row.type) ?? { failures: [], total: 0 };
      group.total++;

      if (row.status === 'failed') {
        const ageDays = row.completedAt
          ? (now - new Date(row.completedAt).getTime()) / (24 * 60 * 60 * 1000)
          : 0;
        group.failures.push({ age: ageDays, attempts: row.attempts });
      }

      typeGroups.set(row.type, group);
    }

    const hotspots: TaskHotspot[] = [];
    for (const [taskType, group] of typeGroups) {
      if (group.failures.length === 0) continue;

      // Decay-weighted hotspot score
      let hotspotScore = 0;
      for (const failure of group.failures) {
        const decayWeight = Math.exp(-LN2 * failure.age / DECAY_HALF_LIFE_DAYS);
        const failureWeight = 1 + Math.min(failure.attempts, 3) * 0.5;
        hotspotScore += decayWeight * failureWeight;
      }

      const failureRate = group.failures.length / Math.max(group.total, 1);
      const avgRetries = group.failures.reduce((sum, f) => sum + f.attempts, 0) / Math.max(group.failures.length, 1);

      // Determine trend by comparing recent vs older failures
      const recentFailures = group.failures.filter(f => f.age < 7).length;
      const olderFailures = group.failures.filter(f => f.age >= 7 && f.age < 30).length;
      let trend: 'improving' | 'stable' | 'worsening' = 'stable';
      if (recentFailures > olderFailures * 1.5) trend = 'worsening';
      else if (recentFailures < olderFailures * 0.5) trend = 'improving';

      hotspots.push({
        taskType,
        agentType: this.inferAgentType(taskType),
        hotspotScore,
        failureRate,
        avgRetries,
        trend,
      });
    }

    return hotspots.sort((a, b) => b.hotspotScore - a.hotspotScore);
  }

  /** Compute performance windows (7d / 30d / 90d) per agent type */
  private async computePerformanceWindows(tenantId: string): Promise<PerformanceWindow[]> {
    const db = getDb();
    const windows: PerformanceWindow[] = [];
    const windowConfigs: Array<{ label: '7d' | '30d' | '90d'; days: number }> = [
      { label: '7d', days: 7 },
      { label: '30d', days: 30 },
      { label: '90d', days: 90 },
    ];

    for (const wc of windowConfigs) {
      const cutoff = new Date(Date.now() - wc.days * 24 * 60 * 60 * 1000);

      const rows = await db.select({
        type: agentTasks.type,
        total: sql<number>`cast(count(*) as int)`,
        failed: sql<number>`cast(count(*) filter (where ${agentTasks.status} = 'failed') as int)`,
        avgDuration: sql<number>`coalesce(avg(${agentTasks.processingTimeMs}), 0)`,
      })
        .from(agentTasks)
        .where(
          and(
            eq(agentTasks.tenantId, tenantId),
            gte(agentTasks.createdAt, cutoff),
          ),
        )
        .groupBy(agentTasks.type);

      // Aggregate by agent type
      const agentAgg = new Map<string, { total: number; failed: number; durations: number[] }>();

      for (const row of rows) {
        const agentType = this.inferAgentType(row.type);
        const agg = agentAgg.get(agentType) ?? { total: 0, failed: 0, durations: [] };
        agg.total += row.total;
        agg.failed += row.failed;
        agg.durations.push(row.avgDuration);
        agentAgg.set(agentType, agg);
      }

      for (const [agentType, agg] of agentAgg) {
        const avgDuration = agg.durations.length > 0
          ? agg.durations.reduce((s, d) => s + d, 0) / agg.durations.length
          : 0;

        windows.push({
          agentType,
          window: wc.label,
          successRate: agg.total > 0 ? (agg.total - agg.failed) / agg.total : 1,
          avgDurationMs: avgDuration,
          totalTasks: agg.total,
          failedTasks: agg.failed,
        });
      }
    }

    return windows;
  }

  /** Compute handler churn: which task types are frequently retried */
  private async computeHandlerChurn(tenantId: string): Promise<HandlerChurn[]> {
    const db = getDb();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await db.select({
      type: agentTasks.type,
      retries: sql<number>`cast(sum(${agentTasks.attempts}) as int)`,
      failures: sql<number>`cast(count(*) filter (where ${agentTasks.status} = 'failed') as int)`,
    })
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.tenantId, tenantId),
          gte(agentTasks.createdAt, cutoff),
        ),
      )
      .groupBy(agentTasks.type);

    return rows.map(row => ({
      taskType: row.type,
      retriesLast30d: row.retries,
      failuresLast30d: row.failures,
      trend: 'stable' as const, // Would need historical comparison for real trend
    }));
  }

  private inferAgentType(taskType: string): string {
    const prefix = taskType.split('_')[0];
    const map: Record<string, string> = {
      seo: 'seo', keyword: 'seo', content: 'content-writer', write: 'content-writer',
      ad: 'ad', optimize: 'ad', manage: 'ad', aeo: 'aeo', scan: 'aeo',
      data: 'data-nexus', daily: 'data-nexus', forecast: 'data-nexus',
      social: 'social', reddit: 'reddit', geo: 'geo',
      sales: 'sales-pipeline', lead: 'sales-pipeline', outbound: 'outbound',
      sequence: 'outbound', finance: 'finance', cfo: 'finance',
      podcast: 'podcast', compatibility: 'compatibility', tech: 'compatibility',
      oauth: 'compatibility', health: 'compatibility',
    };
    return map[prefix ?? ''] ?? 'unknown';
  }
}
