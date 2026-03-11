import { pgTable, uuid, varchar, text, real, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const campaignTypeEnum = pgEnum('campaign_type', ['seo', 'ppc', 'social', 'display', 'video', 'email']);
export const campaignStatusEnum = pgEnum('campaign_status', ['draft', 'pending_review', 'active', 'paused', 'completed', 'archived']);
export const adPlatformEnum = pgEnum('ad_platform', ['google_ads', 'meta_ads', 'linkedin_ads']);
export const bidStrategyEnum = pgEnum('bid_strategy', ['manual_cpc', 'target_cpa', 'target_roas', 'maximize_conversions', 'maximize_clicks']);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  type: campaignTypeEnum('type').notNull(),
  status: campaignStatusEnum('status').notNull().default('draft'),
  platform: adPlatformEnum('platform'),
  budget: jsonb('budget').notNull().default({}),
  targeting: jsonb('targeting').notNull().default({}),
  schedule: jsonb('schedule').notNull().default({}),
  config: jsonb('config').notNull().default({}),
  // Denormalized metrics for fast reads
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  spend: real('spend').notNull().default(0),
  revenue: real('revenue').notNull().default(0),
  ctr: real('ctr').notNull().default(0),
  cpc: real('cpc').notNull().default(0),
  cpa: real('cpa').notNull().default(0),
  roas: real('roas').notNull().default(0),
  qualityScore: real('quality_score'),
  managedByAgent: varchar('managed_by_agent', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
