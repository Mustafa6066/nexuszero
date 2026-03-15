import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const cmsChangeStatusEnum = pgEnum('cms_change_status', ['proposed', 'approved', 'rejected', 'pushed', 'failed', 'rolled_back']);
export const cmsChangeScopeEnum = pgEnum('cms_change_scope', ['meta', 'schema', 'content', 'script', 'custom_code']);

export const cmsChanges = pgTable('cms_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  integrationId: uuid('integration_id').notNull(),
  platform: varchar('platform', { length: 50 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }).notNull(),
  scope: cmsChangeScopeEnum('scope').notNull(),
  status: cmsChangeStatusEnum('status').notNull().default('proposed'),
  proposedBy: varchar('proposed_by', { length: 50 }).notNull(),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state').notNull(),
  changeDescription: text('change_description').notNull(),
  autoApproved: boolean('auto_approved').notNull().default(false),
  approvedBy: varchar('approved_by', { length: 255 }),
  pushedAt: timestamp('pushed_at', { withTimezone: true }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
