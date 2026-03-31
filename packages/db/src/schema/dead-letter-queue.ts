import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const dlqSourceEnum = pgEnum('dlq_source', ['kafka', 'bullmq', 'webhook']);
export const dlqStatusEnum = pgEnum('dlq_status', ['pending', 'retrying', 'resolved', 'discarded']);

/**
 * Dead Letter Queue — captures permanently failed messages from Kafka, BullMQ,
 * and webhook deliveries for manual inspection and retry.
 */
export const deadLetterQueue = pgTable('dead_letter_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  source: dlqSourceEnum('source').notNull(),
  topic: varchar('topic', { length: 200 }).notNull(),
  originalPayload: jsonb('original_payload').notNull(),
  errorMessage: text('error_message').notNull(),
  errorStack: text('error_stack'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  status: dlqStatusEnum('status').notNull().default('pending'),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: varchar('resolved_by', { length: 255 }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
