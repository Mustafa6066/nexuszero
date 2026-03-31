import { pgTable, uuid, varchar, integer, real, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const llmUseCaseEnum = pgEnum('llm_use_case', ['content_writing', 'analysis', 'assistant', 'image_gen']);

export const llmModelConfigs = pgTable('llm_model_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  useCase: llmUseCaseEnum('use_case').notNull(),
  primaryModel: varchar('primary_model', { length: 200 }).notNull(),
  fallbackModel: varchar('fallback_model', { length: 200 }).notNull().default('anthropic/claude-3-5-haiku'),
  maxTokens: integer('max_tokens').notNull().default(4096),
  temperature: real('temperature').notNull().default(0.7),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
