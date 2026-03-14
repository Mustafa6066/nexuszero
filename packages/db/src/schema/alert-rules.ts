import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  name: varchar('name', { length: 200 }).notNull(),
  metric: varchar('metric', { length: 100 }).notNull(),
  operator: varchar('operator', { length: 10 }).notNull(), // gt, lt, eq, gte, lte
  threshold: text('threshold').notNull(),
  channels: jsonb('channels').notNull().default(['in_app']), // in_app, email, webhook
  isActive: boolean('is_active').notNull().default(true),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  cooldownMinutes: integer('cooldown_minutes').notNull().default(60),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
