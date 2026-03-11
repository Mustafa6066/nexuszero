import { pgTable, uuid, varchar, real, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { campaigns } from './campaigns.js';

export const timeGranularityEnum = pgEnum('time_granularity', ['hourly', 'daily', 'weekly', 'monthly']);
export const attributionModelEnum = pgEnum('attribution_model', ['first_touch', 'last_touch', 'linear', 'time_decay', 'position_based', 'data_driven']);
export const marketingChannelEnum = pgEnum('marketing_channel', ['organic_search', 'paid_search', 'social_organic', 'social_paid', 'email', 'display', 'video', 'referral', 'direct', 'affiliate']);

export const analyticsDataPoints = pgTable('analytics_data_points', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  channel: marketingChannelEnum('channel').notNull(),
  granularity: timeGranularityEnum('granularity').notNull(),
  attributionModel: attributionModelEnum('attribution_model').notNull().default('last_touch'),
  date: timestamp('date', { withTimezone: true }).notNull(),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  spend: real('spend').notNull().default(0),
  revenue: real('revenue').notNull().default(0),
  ctr: real('ctr').notNull().default(0),
  cpc: real('cpc').notNull().default(0),
  cpa: real('cpa').notNull().default(0),
  roas: real('roas').notNull().default(0),
  bounceRate: real('bounce_rate'),
  avgSessionDuration: real('avg_session_duration'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const funnelAnalysis = pgTable('funnel_analysis', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  stage: varchar('stage', { length: 50 }).notNull(),
  visitors: integer('visitors').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  conversionRate: real('conversion_rate').notNull().default(0),
  avgTimeInStage: real('avg_time_in_stage'),
  dropOffRate: real('drop_off_rate'),
  date: timestamp('date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const forecasts = pgTable('forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  metric: varchar('metric', { length: 100 }).notNull(),
  forecastDate: timestamp('forecast_date', { withTimezone: true }).notNull(),
  predictedValue: real('predicted_value').notNull(),
  lowerBound: real('lower_bound').notNull(),
  upperBound: real('upper_bound').notNull(),
  confidence: real('confidence').notNull(),
  model: varchar('model', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
