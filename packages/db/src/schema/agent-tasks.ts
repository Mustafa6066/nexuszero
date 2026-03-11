import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { agents } from './agents.js';

export const taskStatusEnum = pgEnum('task_status', ['pending', 'queued', 'processing', 'completed', 'failed', 'cancelled', 'retrying']);
export const taskPriorityEnum = pgEnum('task_priority', ['critical', 'high', 'medium', 'low']);

export const agentTasks = pgTable('agent_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 100 }).notNull(),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  status: taskStatusEnum('status').notNull().default('pending'),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  processingTimeMs: integer('processing_time_ms'),
  parentTaskId: uuid('parent_task_id'),
  dependsOn: jsonb('depends_on'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
