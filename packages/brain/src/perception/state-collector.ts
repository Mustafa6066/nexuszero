import { getDb, agents, agentTasks } from '@nexuszero/db';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { getRedisConnection } from '@nexuszero/queue';
import type { AgentFleetState, AgentState, AgentActivityState } from '../types.js';

// ---------------------------------------------------------------------------
// State Collector — Perception Layer
//
// Gathers agent fleet state: activity status, queue depths, health scores,
// heartbeat freshness, and recent performance metrics per tenant.
// ---------------------------------------------------------------------------

const STALE_HEARTBEAT_MS = 5 * 60 * 1000;

export class StateCollector {
  /** Collect the full fleet state for a tenant */
  async collect(tenantId: string): Promise<AgentFleetState> {
    const [agentRecords, queueDepths, heartbeats] = await Promise.all([
      this.getAgentRecords(tenantId),
      this.getQueueDepths(tenantId),
      this.getHeartbeats(),
    ]);

    const now = Date.now();
    const agentStates: AgentState[] = agentRecords.map(agent => {
      const heartbeat = heartbeats.get(`agent:${agent.type}:heartbeat`);
      const depth = queueDepths.get(agent.type) ?? 0;
      const heartbeatAge = agent.lastHeartbeat
        ? now - new Date(agent.lastHeartbeat).getTime()
        : Infinity;

      const activity = this.resolveActivity(agent.status, heartbeatAge, depth);
      const healthScore = this.computeHealthScore(agent, heartbeatAge);

      return {
        agentId: agent.id,
        agentType: agent.type,
        activity,
        activeJobs: agent.currentTaskId ? 1 : 0,
        queueDepth: depth,
        healthScore,
        lastHeartbeat: agent.lastHeartbeat,
        recentSuccessRate: this.computeSuccessRate(agent.tasksCompleted, agent.tasksFailed),
        avgProcessingTimeMs: agent.avgProcessingTimeMs,
      };
    });

    const totalActiveJobs = agentStates.reduce((sum, a) => sum + a.activeJobs, 0);
    const totalQueuedJobs = agentStates.reduce((sum, a) => sum + a.queueDepth, 0);
    const fleetHealthScore = agentStates.length > 0
      ? agentStates.reduce((sum, a) => sum + a.healthScore, 0) / agentStates.length
      : 1;

    return {
      tenantId,
      agents: agentStates,
      totalActiveJobs,
      totalQueuedJobs,
      fleetHealthScore,
      collectedAt: new Date(),
    };
  }

  private async getAgentRecords(tenantId: string) {
    const db = getDb();
    return db.select().from(agents).where(eq(agents.tenantId, tenantId));
  }

  private async getQueueDepths(tenantId: string): Promise<Map<string, number>> {
    const db = getDb();
    const depths = new Map<string, number>();

    const rows = await db.select({
      type: agentTasks.type,
      count: sql<number>`cast(count(*) as int)`,
    })
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.tenantId, tenantId),
          inArray(agentTasks.status, ['pending', 'queued']),
        ),
      )
      .groupBy(agentTasks.type);

    for (const row of rows) {
      depths.set(row.type, row.count);
    }

    return depths;
  }

  private async getHeartbeats(): Promise<Map<string, unknown>> {
    const redis = getRedisConnection();
    const heartbeats = new Map<string, unknown>();

    // Scan for agent heartbeat keys
    const keys = await redis.keys('agent:*:heartbeat');
    if (keys.length === 0) return heartbeats;

    const values = await redis.mget(...keys);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const val = values[i];
      if (key && val) {
        try {
          heartbeats.set(key, JSON.parse(val));
        } catch {
          // Ignore malformed heartbeats
        }
      }
    }

    return heartbeats;
  }

  private resolveActivity(
    dbStatus: string,
    heartbeatAgeMs: number,
    queueDepth: number,
  ): AgentActivityState {
    if (dbStatus === 'error' || heartbeatAgeMs > STALE_HEARTBEAT_MS) {
      return 'degraded';
    }
    if (dbStatus === 'paused') return 'blocked';
    if (dbStatus === 'processing') return 'active';
    if (queueDepth > 0) return 'ready';
    return 'idle';
  }

  private computeHealthScore(
    agent: { tasksCompleted: number; tasksFailed: number; avgProcessingTimeMs: number },
    heartbeatAgeMs: number,
  ): number {
    const successRate = this.computeSuccessRate(agent.tasksCompleted, agent.tasksFailed);
    const heartbeatPenalty = heartbeatAgeMs > STALE_HEARTBEAT_MS ? 0.3 : 0;
    const processingTimePenalty = agent.avgProcessingTimeMs > 60_000 ? 0.1 : 0;

    return Math.max(0, Math.min(1, successRate - heartbeatPenalty - processingTimePenalty));
  }

  private computeSuccessRate(completed: number, failed: number): number {
    const total = completed + failed;
    if (total === 0) return 1;
    return completed / total;
  }
}
