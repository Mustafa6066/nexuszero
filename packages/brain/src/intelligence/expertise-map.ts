import { getDb, agentTasks } from '@nexuszero/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getRedisConnection } from '@nexuszero/queue';
import type { AgentExpertise } from '../types.js';

// ---------------------------------------------------------------------------
// Agent Expertise Map — Intelligence Layer
//
// Tracks which agents excel at which task types per tenant. Detects
// single-points-of-failure where only one agent can handle a task type.
//
// Inspired by Repowise's Knowledge Map (ownership, bus factor, onboarding).
// ---------------------------------------------------------------------------

const CACHE_KEY = (tenantId: string) => `brain:intelligence:expertise:${tenantId}`;
const CACHE_TTL = 86_400; // 24h

export interface ExpertiseMapSnapshot {
  expertise: AgentExpertise[];
  singlePointsOfFailure: AgentExpertise[];
  skillGaps: string[];
  busFactorByTask: Record<string, number>;
  generatedAt: Date;
}

export class ExpertiseMap {
  /** Build the complete expertise map for a tenant */
  async analyze(tenantId: string): Promise<ExpertiseMapSnapshot> {
    const redis = getRedisConnection();
    const cached = await redis.get(CACHE_KEY(tenantId));
    if (cached) {
      try {
        return JSON.parse(cached) as ExpertiseMapSnapshot;
      } catch {
        // Rebuild
      }
    }

    const expertise = await this.computeExpertise(tenantId);
    const singlePointsOfFailure = expertise.filter(e => e.isSinglePointOfFailure);
    const busFactorByTask = this.computeBusFactor(expertise);
    const skillGaps = this.detectSkillGaps(expertise);

    const snapshot: ExpertiseMapSnapshot = {
      expertise,
      singlePointsOfFailure,
      skillGaps,
      busFactorByTask,
      generatedAt: new Date(),
    };

    await redis.setex(CACHE_KEY(tenantId), CACHE_TTL, JSON.stringify(snapshot));
    return snapshot;
  }

  /** Get single-points-of-failure for alerting */
  async getSinglePointsOfFailure(tenantId: string): Promise<AgentExpertise[]> {
    const snapshot = await this.analyze(tenantId);
    return snapshot.singlePointsOfFailure;
  }

  private async computeExpertise(tenantId: string): Promise<AgentExpertise[]> {
    const db = getDb();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

    // Get task execution stats grouped by task type
    const rows = await db.select({
      type: agentTasks.type,
      total: sql<number>`cast(count(*) as int)`,
      completed: sql<number>`cast(count(*) filter (where ${agentTasks.status} = 'completed') as int)`,
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

    // Track which agent types handle each task type
    const taskToAgents = new Map<string, Set<string>>();
    const expertise: AgentExpertise[] = [];

    for (const row of rows) {
      const agentType = this.inferAgentType(row.type);

      if (!taskToAgents.has(row.type)) {
        taskToAgents.set(row.type, new Set());
      }
      taskToAgents.get(row.type)!.add(agentType);

      expertise.push({
        agentType,
        taskType: row.type,
        successRate: row.total > 0 ? row.completed / row.total : 0,
        avgDurationMs: row.avgDuration,
        volumeLast30d: row.total,
        isSinglePointOfFailure: false, // Will be set after full analysis
      });
    }

    // Mark single-points-of-failure
    for (const entry of expertise) {
      const agents = taskToAgents.get(entry.taskType);
      if (agents && agents.size === 1) {
        entry.isSinglePointOfFailure = true;
      }
    }

    return expertise;
  }

  /** Bus factor: how many agents can handle each task type (1 = SPOF) */
  private computeBusFactor(expertise: AgentExpertise[]): Record<string, number> {
    const taskAgents = new Map<string, Set<string>>();

    for (const entry of expertise) {
      if (!taskAgents.has(entry.taskType)) {
        taskAgents.set(entry.taskType, new Set());
      }
      taskAgents.get(entry.taskType)!.add(entry.agentType);
    }

    const busFactor: Record<string, number> = {};
    for (const [taskType, agents] of taskAgents) {
      busFactor[taskType] = agents.size;
    }

    return busFactor;
  }

  /** Detect skill gaps: known task types that have very low volume or 0 success rate */
  private detectSkillGaps(expertise: AgentExpertise[]): string[] {
    const gaps: string[] = [];

    for (const entry of expertise) {
      if (entry.volumeLast30d > 5 && entry.successRate < 0.3) {
        gaps.push(`${entry.agentType} has low success rate (${(entry.successRate * 100).toFixed(0)}%) on ${entry.taskType}`);
      }
    }

    return gaps;
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
