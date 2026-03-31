import { pgTable, uuid, varchar, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// ---------------------------------------------------------------------------
// Plan Approvals — human-in-the-loop approval gates for agent actions
//
// When an agent proposes a high-risk action (e.g., campaign launch, budget
// change, CMS publish), it creates an approval request here. The action
// is blocked until a human approves or the request expires (24h default).
// ---------------------------------------------------------------------------

export const planApprovals = pgTable('plan_approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

  /** Agent type that requested approval */
  agentType: varchar('agent_type', { length: 50 }).notNull(),
  /** Task ID that triggered the approval request */
  taskId: varchar('task_id', { length: 100 }).notNull(),

  /** What the agent wants to do (human-readable) */
  title: varchar('title', { length: 200 }).notNull(),
  /** Detailed description of the proposed action */
  description: text('description').notNull(),

  /** Category of action for routing/filtering */
  actionType: varchar('action_type', { length: 50 }).notNull(),

  /** Structured plan data (agent-specific, e.g., campaign config, CMS changes) */
  planData: jsonb('plan_data').$type<Record<string, unknown>>().default({}),

  /** Current status */
  status: varchar('status', { length: 20 }).notNull().default('pending'),

  /** Who approved/rejected (user ID) */
  reviewedBy: uuid('reviewed_by'),
  /** Review notes */
  reviewNotes: text('review_notes'),
  /** When reviewed */
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),

  /** When this approval expires (default: 24h after creation) */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

  /** Correlation ID for tracing */
  correlationId: varchar('correlation_id', { length: 100 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('plan_approvals_tenant_idx').on(table.tenantId),
  statusIdx: index('plan_approvals_status_idx').on(table.tenantId, table.status),
  taskIdx: index('plan_approvals_task_idx').on(table.taskId),
  expiresIdx: index('plan_approvals_expires_idx').on(table.expiresAt),
}));
