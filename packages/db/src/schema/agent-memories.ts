import { pgTable, uuid, varchar, text, real, integer, timestamp, jsonb, customType, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Agent Memory — per-tenant episodic memory with vector similarity search
//
// Agents store learnings, outcomes, and strategy insights here.
// Memory entries are embedded (pgvector) for semantic retrieval during
// future task planning.
// ---------------------------------------------------------------------------

/** Custom pgvector column type (same as aeo-citations) */
const vector = customType<{ data: number[]; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === 'string') {
      return value.replace(/[[\]]/g, '').split(',').map(Number);
    }
    return value as number[];
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
});

export const agentMemories = pgTable('agent_memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

  /** Which agent type created this memory */
  agentType: varchar('agent_type', { length: 50 }).notNull(),

  /** Memory category for filtering */
  category: varchar('category', { length: 50 }).notNull(),

  /** Human-readable summary of the learning */
  content: text('content').notNull(),

  /** Structured metadata (metrics, context, references) */
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

  /** Embedding vector for semantic search (1536-dim, OpenAI ada-002 compatible) */
  embedding: vector('embedding', { dimensions: 1536 }),

  /** How useful/reliable this memory proved to be (0.0–1.0, updated over time) */
  reliability: real('reliability').default(0.5).notNull(),

  /** Access count — incremented each time this memory is retrieved */
  accessCount: integer('access_count').default(0).notNull(),

  /** Task or signal that created this memory */
  sourceTaskId: varchar('source_task_id', { length: 100 }),
  sourceSignalType: varchar('source_signal_type', { length: 100 }),

  /** Correlation ID for tracing */
  correlationId: varchar('correlation_id', { length: 100 }),

  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('agent_memories_tenant_idx').on(table.tenantId),
  agentTypeIdx: index('agent_memories_agent_type_idx').on(table.tenantId, table.agentType),
  categoryIdx: index('agent_memories_category_idx').on(table.tenantId, table.category),
  createdAtIdx: index('agent_memories_created_at_idx').on(table.tenantId, table.createdAt),
}));

/** Memory categories that agents can store */
export type AgentMemoryCategory =
  | 'strategy_outcome'    // Result of a strategy decision
  | 'keyword_insight'     // Learned keyword/SEO pattern
  | 'audience_behavior'   // Audience engagement pattern
  | 'campaign_learning'   // What worked/failed in campaigns
  | 'anomaly_pattern'     // Recognized anomaly pattern
  | 'competitive_intel'   // Competitor insights
  | 'content_performance' // Content that performed well/poorly
  | 'integration_issue'   // Platform-specific quirks
  | 'budget_optimization' // Spend optimization learnings
  | 'timing_insight';     // Temporal patterns (best times, seasonal trends)
