import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const notificationTypeEnum = pgEnum('notification_type', ['alert', 'digest', 'activity', 'health', 'feature', 'approval', 'system']);
export const notificationPriorityEnum = pgEnum('notification_priority', ['critical', 'advisory', 'info']);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull().default('activity'),
  priority: notificationPriorityEnum('priority').notNull().default('info'),
  title: varchar('title', { length: 300 }).notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  source: varchar('source', { length: 100 }),
  actionUrl: varchar('action_url', { length: 500 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
