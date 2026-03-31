import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const attachmentStatusEnum = pgEnum('attachment_status', ['pending', 'parsed', 'failed']);

export const assistantAttachments = pgTable('assistant_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull(),
  messageId: uuid('message_id'),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storageKey: varchar('storage_key', { length: 1000 }).notNull(),
  parsedText: text('parsed_text'),
  parsedSummary: text('parsed_summary'),
  status: attachmentStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
