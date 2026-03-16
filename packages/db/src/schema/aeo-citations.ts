import { pgTable, uuid, varchar, text, real, integer, timestamp, jsonb, boolean, pgEnum, customType } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

/** Custom pgvector column type — drizzle-orm 0.30.x doesn't export vector natively */
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

export const aiPlatformEnum = pgEnum('ai_platform', ['chatgpt', 'perplexity', 'google_ai_overview', 'gemini', 'bing_copilot', 'claude']);
export const schemaMarkupStatusEnum = pgEnum('schema_markup_status', ['missing', 'partial', 'complete', 'optimized']);

export const aeoCitations = pgTable('aeo_citations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  platform: aiPlatformEnum('platform').notNull(),
  query: text('query').notNull(),
  citationUrl: text('citation_url'),
  citationText: text('citation_text'),
  position: integer('position'),
  isBrandMention: boolean('is_brand_mention').notNull().default(false),
  sentiment: real('sentiment'),
  competitorsCited: jsonb('competitors_cited'),
  discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const entityProfiles = pgTable('entity_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  entityName: varchar('entity_name', { length: 255 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  description: text('description'),
  knowledgeGraphId: varchar('knowledge_graph_id', { length: 255 }),
  schemaMarkupStatus: schemaMarkupStatusEnum('schema_markup_status').notNull().default('missing'),
  optimizedSchema: jsonb('optimized_schema'),
  attributes: jsonb('attributes'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiVisibilityScores = pgTable('ai_visibility_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  platform: aiPlatformEnum('platform').notNull(),
  overallScore: real('overall_score').notNull(),
  citationFrequency: real('citation_frequency').notNull(),
  sentimentScore: real('sentiment_score').notNull(),
  contentRelevance: real('content_relevance').notNull(),
  entityClarity: real('entity_clarity').notNull(),
  recommendations: jsonb('recommendations'),
  measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
