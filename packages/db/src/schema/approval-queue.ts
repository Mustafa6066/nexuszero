import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'rejected', 'auto_approved']);
export const autonomyLevelEnum = pgEnum('autonomy_level', ['manual', 'guardrailed', 'autonomous']);

export const approvalQueue = pgTable('approval_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  agentType: varchar('agent_type', { length: 50 }).notNull(),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  proposedChange: jsonb('proposed_change').notNull(),
  currentValue: jsonb('current_value'),
  thresholdHit: varchar('threshold_hit', { length: 200 }),
  status: approvalStatusEnum('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  taskId: uuid('task_id'),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
