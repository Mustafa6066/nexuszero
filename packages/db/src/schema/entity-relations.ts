import { pgTable, uuid, varchar, text, real, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { entityProfiles } from './aeo-citations.js';

/**
 * Entity Relations — triples table for the knowledge graph.
 * Stores (subject, predicate, object) relationships between entities.
 * Traversed via recursive CTEs for JSON-LD generation.
 */
export const entityRelations = pgTable('entity_relations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id').notNull().references(() => entityProfiles.id, { onDelete: 'cascade' }),
  predicate: varchar('predicate', { length: 255 }).notNull(),
  objectId: uuid('object_id').references(() => entityProfiles.id, { onDelete: 'cascade' }),
  objectLiteral: text('object_literal'),
  objectType: varchar('object_type', { length: 100 }),
  confidence: real('confidence').notNull().default(0.8),
  source: varchar('source', { length: 50 }).notNull().default('llm'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  subjectIdx: index('idx_entity_relations_subject').on(table.subjectId),
  objectIdx: index('idx_entity_relations_object').on(table.objectId),
  tenantIdx: index('idx_entity_relations_tenant').on(table.tenantId),
  predicateIdx: index('idx_entity_relations_predicate').on(table.predicate),
}));
