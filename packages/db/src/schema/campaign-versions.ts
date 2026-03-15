import { pgTable, uuid, integer, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { campaigns } from './campaigns.js';

export const campaignVersions = pgTable('campaign_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),           // full campaign state
  changedBy: varchar('changed_by', { length: 50 }).notNull(), // 'user' | agent type
  changeReason: text('change_reason'),
  agentActionId: uuid('agent_action_id'),          // FK to agent_actions (soft — avoids circular dep)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
