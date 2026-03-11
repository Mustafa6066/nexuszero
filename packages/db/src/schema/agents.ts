import { pgTable, uuid, varchar, integer, real, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
export const agentTypeEnum = pgEnum('agent_type', ['seo', 'ad', 'data-nexus', 'creative', 'aeo', 'compatibility']);
export const agentStatusEnum = pgEnum('agent_status', ['idle', 'processing', 'paused', 'error', 'offline']);

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  type: agentTypeEnum('type').notNull(),
  status: agentStatusEnum('status').notNull().default('idle'),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }),
  currentTaskId: uuid('current_task_id'),
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  tasksFailed: integer('tasks_failed').notNull().default(0),
  avgProcessingTimeMs: real('avg_processing_time_ms').notNull().default(0),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
