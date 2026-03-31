import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, real, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const redditReplyStatusEnum = pgEnum('reddit_reply_status', ['pending', 'approved', 'posted', 'dismissed']);

export const redditMentions = pgTable('reddit_mentions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subreddit: varchar('subreddit', { length: 100 }).notNull(),
  postId: varchar('post_id', { length: 50 }).notNull(),
  commentId: varchar('comment_id', { length: 50 }),
  postTitle: text('post_title').notNull(),
  mentionText: text('mention_text').notNull(),
  postUrl: text('post_url').notNull(),
  author: varchar('author', { length: 100 }).notNull(),
  score: integer('score').notNull().default(0),
  sentiment: real('sentiment').notNull().default(0),
  intent: varchar('intent', { length: 50 }).notNull().default('neutral'),
  draftReply: text('draft_reply'),
  replyStatus: redditReplyStatusEnum('reply_status').notNull().default('pending'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const redditMonitoredSubreddits = pgTable('reddit_monitored_subreddits', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subreddit: varchar('subreddit', { length: 100 }).notNull(),
  keywords: jsonb('keywords').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
