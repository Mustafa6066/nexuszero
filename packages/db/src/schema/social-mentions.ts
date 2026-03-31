import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, real, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const socialPlatformEnum = pgEnum('social_platform', ['twitter', 'hackernews', 'youtube']);
export const socialReplyStatusEnum = pgEnum('social_reply_status', ['monitor', 'draft', 'approved', 'posted']);

export const socialMentions = pgTable('social_mentions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  platform: socialPlatformEnum('platform').notNull(),
  externalId: varchar('external_id', { length: 100 }).notNull(),
  authorHandle: varchar('author_handle', { length: 100 }),
  content: text('content').notNull(),
  url: text('url').notNull(),
  videoId: varchar('video_id', { length: 20 }),
  sentiment: real('sentiment').notNull().default(0),
  intent: varchar('intent', { length: 50 }).notNull().default('neutral'),
  engagementScore: real('engagement_score').notNull().default(0),
  draftReply: text('draft_reply'),
  replyStatus: socialReplyStatusEnum('reply_status').notNull().default('monitor'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const socialListeningConfig = pgTable('social_listening_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  platform: socialPlatformEnum('platform').notNull(),
  keywords: jsonb('keywords').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
