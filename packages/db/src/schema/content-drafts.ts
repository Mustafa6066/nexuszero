import { pgTable, uuid, varchar, text, timestamp, jsonb, real, integer, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const contentTypeEnum = pgEnum('content_type', ['blog_post', 'social_post', 'email', 'landing_page']);
export const contentStatusEnum = pgEnum('content_status', ['draft', 'review', 'approved', 'published', 'rejected']);

export const contentDrafts = pgTable('content_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  type: contentTypeEnum('type').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  brief: jsonb('brief').notNull().default({}),
  status: contentStatusEnum('status').notNull().default('draft'),
  seoScore: real('seo_score'),
  readabilityScore: real('readability_score'),
  llmModel: varchar('llm_model', { length: 100 }),
  generationTimeMs: integer('generation_time_ms'),
  taskId: uuid('task_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  cmsChangeId: uuid('cms_change_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
