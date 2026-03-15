import { pgTable, uuid, varchar, text, real, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { agents } from './agents.js';

export const actionCategoryEnum = pgEnum('action_category', [
  'optimization', 'creation', 'modification', 'analysis', 'alert', 'rollback',
]);

export const agentActions = pgTable('agent_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  taskId: uuid('task_id'),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  category: actionCategoryEnum('category').notNull().default('analysis'),
  reasoning: text('reasoning').notNull(),
  trigger: jsonb('trigger'),        // { metric, threshold, actual, campaign, signal }
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state'),
  confidence: real('confidence'),    // 0.0–1.0
  impactMetric: varchar('impact_metric', { length: 100 }),
  impactDelta: real('impact_delta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
