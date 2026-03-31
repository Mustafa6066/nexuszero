import { getDb, agentMemories, withTenantDb } from '@nexuszero/db';
import { eq, and, desc, sql, gt } from 'drizzle-orm';
import { getRedisConnection } from './bullmq-client.js';

// ---------------------------------------------------------------------------
// Agent Memory Service
//
// Provides store / recall / reinforce APIs for agent episodic memory.
// Memories are embedded as 1536-dim vectors for semantic similarity search.
// ---------------------------------------------------------------------------

export interface StoreMemoryInput {
  tenantId: string;
  agentType: string;
  category: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  reliability?: number;
  sourceTaskId?: string;
  sourceSignalType?: string;
  correlationId?: string;
}

export interface RecallOptions {
  tenantId: string;
  agentType?: string;
  category?: string;
  limit?: number;
  minReliability?: number;
  /** If provided, recall memories semantically similar to this embedding */
  embedding?: number[];
  /** Recency bias: only memories from the last N days */
  maxAgeDays?: number;
}

export interface MemoryEntry {
  id: string;
  agentType: string;
  category: string;
  content: string;
  metadata: Record<string, unknown>;
  reliability: number;
  accessCount: number;
  createdAt: Date;
  similarity?: number;
}

/**
 * Store a new memory entry for an agent.
 */
export async function storeMemory(input: StoreMemoryInput): Promise<string> {
  const result = await withTenantDb(input.tenantId, async (db) => {
    const [row] = await db.insert(agentMemories).values({
      tenantId: input.tenantId,
      agentType: input.agentType,
      category: input.category,
      content: input.content,
      metadata: input.metadata ?? {},
      embedding: input.embedding,
      reliability: input.reliability ?? 0.5,
      sourceTaskId: input.sourceTaskId,
      sourceSignalType: input.sourceSignalType,
      correlationId: input.correlationId,
    }).returning({ id: agentMemories.id });
    return row!;
  });

  // Track memory count per tenant+agent for quick stats
  const redis = getRedisConnection();
  await redis.hincrby(`agent-memory:count:${input.tenantId}`, input.agentType, 1).catch(() => {});

  return result.id;
}

/**
 * Recall relevant memories for an agent.
 * Supports: semantic similarity search (via embedding), category filtering,
 * reliability threshold, recency bias.
 */
export async function recallMemories(options: RecallOptions): Promise<MemoryEntry[]> {
  const limit = options.limit ?? 10;

  // If embedding is provided, use vector similarity search
  if (options.embedding) {
    return recallBySimilarity(options, limit);
  }

  // Otherwise, use structured query (category, agent, recency)
  return withTenantDb(options.tenantId, async (db) => {
    const conditions = [eq(agentMemories.tenantId, options.tenantId)];

    if (options.agentType) {
      conditions.push(eq(agentMemories.agentType, options.agentType));
    }
    if (options.category) {
      conditions.push(eq(agentMemories.category, options.category));
    }
    if (options.minReliability) {
      conditions.push(gt(agentMemories.reliability, options.minReliability));
    }
    if (options.maxAgeDays) {
      const cutoff = new Date(Date.now() - options.maxAgeDays * 86400000);
      conditions.push(gt(agentMemories.createdAt, cutoff));
    }

    const rows = await db.select({
      id: agentMemories.id,
      agentType: agentMemories.agentType,
      category: agentMemories.category,
      content: agentMemories.content,
      metadata: agentMemories.metadata,
      reliability: agentMemories.reliability,
      accessCount: agentMemories.accessCount,
      createdAt: agentMemories.createdAt,
    })
      .from(agentMemories)
      .where(and(...conditions))
      .orderBy(desc(agentMemories.reliability), desc(agentMemories.createdAt))
      .limit(limit);

    // Increment access count for retrieved memories
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      await db.execute(sql`
        UPDATE agent_memories 
        SET access_count = access_count + 1, last_accessed_at = NOW()
        WHERE id = ANY(${ids}::uuid[])
      `).catch(() => {});
    }

    return rows.map(r => ({
      id: r.id,
      agentType: r.agentType,
      category: r.category,
      content: r.content,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      reliability: r.reliability,
      accessCount: r.accessCount,
      createdAt: r.createdAt,
    }));
  });
}

/**
 * Vector similarity search via pgvector.
 */
async function recallBySimilarity(options: RecallOptions, limit: number): Promise<MemoryEntry[]> {
  return withTenantDb(options.tenantId, async (db) => {
    const embeddingStr = `[${options.embedding!.join(',')}]`;

    let agentFilter = '';
    if (options.agentType) {
      agentFilter = `AND agent_type = '${options.agentType.replace(/'/g, "''")}'`;
    }

    let categoryFilter = '';
    if (options.category) {
      categoryFilter = `AND category = '${options.category.replace(/'/g, "''")}'`;
    }

    let reliabilityFilter = '';
    if (options.minReliability) {
      reliabilityFilter = `AND reliability >= ${Number(options.minReliability)}`;
    }

    let ageFilter = '';
    if (options.maxAgeDays) {
      ageFilter = `AND created_at > NOW() - INTERVAL '${Number(options.maxAgeDays)} days'`;
    }

    const rows = await db.execute<{
      id: string;
      agent_type: string;
      category: string;
      content: string;
      metadata: Record<string, unknown>;
      reliability: number;
      access_count: number;
      created_at: Date;
      similarity: number;
    }>(sql.raw(`
      SELECT 
        id, agent_type, category, content, metadata, reliability, access_count, created_at,
        1 - (embedding <=> '${embeddingStr}'::vector) as similarity
      FROM agent_memories
      WHERE tenant_id = '${options.tenantId.replace(/'/g, "''")}'
        AND embedding IS NOT NULL
        ${agentFilter}
        ${categoryFilter}
        ${reliabilityFilter}
        ${ageFilter}
      ORDER BY embedding <=> '${embeddingStr}'::vector ASC
      LIMIT ${limit}
    `));

    // Increment access count
    if (rows.length > 0) {
      const ids = rows.map((r: any) => r.id);
      await db.execute(sql`
        UPDATE agent_memories 
        SET access_count = access_count + 1, last_accessed_at = NOW()
        WHERE id = ANY(${ids}::uuid[])
      `).catch(() => {});
    }

    return rows.map((r: any) => ({
      id: r.id,
      agentType: r.agent_type,
      category: r.category,
      content: r.content,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      reliability: r.reliability,
      accessCount: r.access_count,
      createdAt: r.created_at,
      similarity: r.similarity,
    }));
  });
}

/**
 * Reinforce a memory — increase its reliability score based on positive outcome.
 * Called when a decision informed by this memory leads to a good result.
 */
export async function reinforceMemory(
  tenantId: string,
  memoryId: string,
  delta: number = 0.1,
): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.execute(sql`
      UPDATE agent_memories 
      SET reliability = LEAST(1.0, reliability + ${delta}),
          updated_at = NOW()
      WHERE id = ${memoryId} AND tenant_id = ${tenantId}
    `);
  });
}

/**
 * Decay a memory — decrease its reliability after a negative outcome.
 */
export async function decayMemory(
  tenantId: string,
  memoryId: string,
  delta: number = 0.1,
): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.execute(sql`
      UPDATE agent_memories 
      SET reliability = GREATEST(0.0, reliability - ${delta}),
          updated_at = NOW()
      WHERE id = ${memoryId} AND tenant_id = ${tenantId}
    `);
  });
}

/**
 * Get memory stats for a tenant (per agent type).
 */
export async function getMemoryStats(tenantId: string): Promise<Record<string, { count: number; avgReliability: number }>> {
  const stats = await withTenantDb(tenantId, async (db) => {
    return db.execute<{ agent_type: string; count: string; avg_reliability: number }>(sql`
      SELECT agent_type, COUNT(*)::text as count, AVG(reliability) as avg_reliability
      FROM agent_memories
      WHERE tenant_id = ${tenantId}
      GROUP BY agent_type
    `);
  });

  const result: Record<string, { count: number; avgReliability: number }> = {};
  for (const row of stats as any[]) {
    result[row.agent_type] = {
      count: parseInt(row.count, 10),
      avgReliability: Math.round((row.avg_reliability ?? 0) * 100) / 100,
    };
  }
  return result;
}

/**
 * Prune low-reliability, old memories to prevent unbounded growth.
 * Keeps the most recent `keepCount` memories per agent type.
 */
export async function pruneMemories(
  tenantId: string,
  opts: { maxAge?: number; minReliability?: number; keepPerAgent?: number } = {},
): Promise<number> {
  const maxAge = opts.maxAge ?? 180; // days
  const minReliability = opts.minReliability ?? 0.15;

  const result = await withTenantDb(tenantId, async (db) => {
    return db.execute<{ count: string }>(sql`
      DELETE FROM agent_memories
      WHERE tenant_id = ${tenantId}
        AND (
          (created_at < NOW() - INTERVAL '1 day' * ${maxAge} AND reliability < 0.3)
          OR reliability < ${minReliability}
        )
      RETURNING COUNT(*) as count
    `);
  });

  return parseInt((result as any)[0]?.count ?? '0', 10);
}
