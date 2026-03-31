// ---------------------------------------------------------------------------
// Memory Consolidation ("Dream") — inspired by src/ memory consolidation
//
// Periodically synthesizes raw episodic memories into consolidated insights.
// Uses gated triggers: minimum 24h since last consolidation, at least 5
// unconsolidated memories, and a Redis distributed lock.
// ---------------------------------------------------------------------------

import { routedCompletion } from '@nexuszero/llm-router';
import { getDb, agentMemories } from '@nexuszero/db';
import { getRedisConnection } from './bullmq-client.js';
import { and, eq, gte, isNull, sql, desc } from 'drizzle-orm';

/** Minimum interval between consolidation runs per tenant+agent */
const MIN_CONSOLIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
/** Minimum number of unconsolidated memories to trigger */
const MIN_UNCONSOLIDATED_COUNT = 5;
/** Redis lock TTL */
const LOCK_TTL_S = 300; // 5 minutes
/** Model used for synthesis (cheap) */
const SYNTHESIS_MODEL = 'anthropic/claude-3-5-haiku';

interface ConsolidationResult {
  consolidated: boolean;
  reason?: string;
  memoriesProcessed?: number;
  insightsCreated?: number;
}

/**
 * Check all gates and run consolidation if conditions are met.
 */
export async function attemptConsolidation(
  tenantId: string,
  agentType: string,
): Promise<ConsolidationResult> {
  // Gate 1: Check time since last consolidation
  const lastConsolidation = await getLastConsolidationTime(tenantId, agentType);
  if (lastConsolidation && Date.now() - lastConsolidation.getTime() < MIN_CONSOLIDATION_INTERVAL_MS) {
    return { consolidated: false, reason: 'too_recent' };
  }

  // Gate 2: Count unconsolidated memories
  const count = await countUnconsolidatedMemories(tenantId, agentType);
  if (count < MIN_UNCONSOLIDATED_COUNT) {
    return { consolidated: false, reason: 'insufficient_memories' };
  }

  // Gate 3: Acquire distributed lock
  const lockKey = `consolidation:lock:${tenantId}:${agentType}`;
  const locked = await acquireLock(lockKey, LOCK_TTL_S);
  if (!locked) {
    return { consolidated: false, reason: 'lock_held' };
  }

  try {
    return await runConsolidation(tenantId, agentType);
  } finally {
    await releaseLock(lockKey);
  }
}

async function getLastConsolidationTime(tenantId: string, agentType: string): Promise<Date | null> {
  const db = getDb();
  const rows = await db.select({ createdAt: agentMemories.createdAt })
    .from(agentMemories)
    .where(and(
      eq(agentMemories.tenantId, tenantId),
      eq(agentMemories.agentType, agentType),
      eq(agentMemories.category, 'consolidated_insight'),
    ))
    .orderBy(desc(agentMemories.createdAt))
    .limit(1);

  return rows[0]?.createdAt ?? null;
}

async function countUnconsolidatedMemories(tenantId: string, agentType: string): Promise<number> {
  const db = getDb();
  const rows = await db.select({ count: sql<number>`count(*)` })
    .from(agentMemories)
    .where(and(
      eq(agentMemories.tenantId, tenantId),
      eq(agentMemories.agentType, agentType),
      sql`${agentMemories.category} != 'consolidated_insight'`,
      isNull(sql`${agentMemories.metadata}->>'consolidatedInto'`),
    ));

  return Number(rows[0]?.count ?? 0);
}

async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch {
    return false;
  }
}

async function releaseLock(key: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.del(key);
  } catch {
    // Best effort
  }
}

async function runConsolidation(
  tenantId: string,
  agentType: string,
): Promise<ConsolidationResult> {
  const db = getDb();

  // Fetch unconsolidated memories
  const memories = await db.select()
    .from(agentMemories)
    .where(and(
      eq(agentMemories.tenantId, tenantId),
      eq(agentMemories.agentType, agentType),
      sql`${agentMemories.category} != 'consolidated_insight'`,
      isNull(sql`${agentMemories.metadata}->>'consolidatedInto'`),
    ))
    .orderBy(agentMemories.createdAt)
    .limit(50); // Process in batches of 50

  if (memories.length === 0) {
    return { consolidated: false, reason: 'no_memories' };
  }

  // Format memories for synthesis
  const memoriesText = memories.map((m, i) =>
    `[${i + 1}] (${m.category}, reliability: ${m.reliability}) ${m.content}`
  ).join('\n');

  // Use Haiku for synthesis (cheap, fast)
  const synthesis = await routedCompletion({
    model: SYNTHESIS_MODEL,
    systemPrompt: `You are a memory consolidation agent. Analyze the following episodic memories and produce consolidated insights.

Rules:
- Group related memories into themes
- Identify patterns, contradictions, and trends
- Score each insight's confidence (0.0-1.0) based on supporting evidence count
- Output valid JSON array of objects with fields: title (string), insight (string), confidence (number), sourceIndices (number[])

Output ONLY the JSON array, no other text.`,
    messages: [
      { role: 'user', content: `Consolidate these ${memories.length} memories:\n\n${memoriesText}` },
    ],
    maxTokens: 2048,
    temperature: 0.3,
    agentType,
  });

  // Parse synthesis results
  let insights: Array<{ title: string; insight: string; confidence: number; sourceIndices: number[] }>;
  try {
    insights = JSON.parse(synthesis);
    if (!Array.isArray(insights)) throw new Error('Expected array');
  } catch {
    console.warn('[memory-consolidation] Failed to parse synthesis output');
    return { consolidated: false, reason: 'parse_error' };
  }

  // Store consolidated insights
  const insightIds: string[] = [];
  for (const insight of insights) {
    const [inserted] = await db.insert(agentMemories).values({
      tenantId,
      agentType,
      category: 'consolidated_insight',
      content: `${insight.title}: ${insight.insight}`,
      reliability: Math.min(1, insight.confidence),
      metadata: {
        sourceCount: insight.sourceIndices.length,
        consolidatedAt: new Date().toISOString(),
      },
    }).returning({ id: agentMemories.id });

    if (inserted) insightIds.push(inserted.id);
  }

  // Mark source memories as consolidated
  const consolidatedIntoId = insightIds[0] ?? 'batch';
  for (const memory of memories) {
    await db.update(agentMemories)
      .set({
        metadata: {
          ...(memory.metadata as Record<string, unknown>),
          consolidatedInto: consolidatedIntoId,
          consolidatedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(agentMemories.id, memory.id));
  }

  return {
    consolidated: true,
    memoriesProcessed: memories.length,
    insightsCreated: insights.length,
  };
}
