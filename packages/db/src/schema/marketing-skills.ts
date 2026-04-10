import { pgTable, uuid, varchar, text, real, integer, timestamp, jsonb, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const experimentStatusEnum = pgEnum('experiment_status', ['draft', 'running', 'paused', 'completed', 'discarded']);

export const experiments = pgTable('experiments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  hypothesis: text('hypothesis').notNull(),
  status: experimentStatusEnum('status').notNull().default('draft'),
  channel: varchar('channel', { length: 50 }).notNull(),
  controlLabel: varchar('control_label', { length: 100 }).notNull().default('Control'),
  variantLabels: jsonb('variant_labels').notNull().default([]),
  config: jsonb('config').notNull().default({}),
  winner: varchar('winner', { length: 100 }),
  lift: real('lift'),
  pValue: real('p_value'),
  sampleSize: integer('sample_size').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const experimentDataPoints = pgTable('experiment_data_points', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  experimentId: uuid('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  variantLabel: varchar('variant_label', { length: 100 }).notNull(),
  metricName: varchar('metric_name', { length: 100 }).notNull(),
  metricValue: real('metric_value').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const playbookEntries = pgTable('playbook_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  experimentId: uuid('experiment_id').references(() => experiments.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 200 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  insight: text('insight').notNull(),
  impact: text('impact'),
  confidence: real('confidence').notNull().default(0),
  tags: jsonb('tags').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contentScores = pgTable('content_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contentId: varchar('content_id', { length: 100 }),
  contentType: varchar('content_type', { length: 50 }).notNull(),
  totalScore: real('total_score').notNull(),
  dimensions: jsonb('dimensions').notNull().default({}),
  humanizerScore: real('humanizer_score'),
  expertPanelScore: real('expert_panel_score'),
  passed: boolean('passed').notNull(),
  threshold: real('threshold').notNull(),
  scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
});

export const icpProfiles = pgTable('icp_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  industries: jsonb('industries').notNull().default([]),
  companySizeRange: jsonb('company_size_range').notNull().default({}),
  titles: jsonb('titles').notNull().default([]),
  signals: jsonb('signals').notNull().default([]),
  approvalRate: real('approval_rate'),
  totalLeads: integer('total_leads').notNull().default(0),
  approvedLeads: integer('approved_leads').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const prospectSignals = pgTable('prospect_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  signalType: varchar('signal_type', { length: 50 }).notNull(),
  companyName: varchar('company_name', { length: 200 }),
  companyDomain: varchar('company_domain', { length: 200 }),
  contactName: varchar('contact_name', { length: 200 }),
  contactTitle: varchar('contact_title', { length: 200 }),
  signalData: jsonb('signal_data').notNull().default({}),
  compositeScore: real('composite_score').notNull().default(0),
  processed: boolean('processed').notNull().default(false),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dealRecords = pgTable('deal_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  crmDealId: varchar('crm_deal_id', { length: 100 }),
  companyName: varchar('company_name', { length: 200 }).notNull(),
  contactName: varchar('contact_name', { length: 200 }),
  contactEmail: varchar('contact_email', { length: 200 }),
  dealValue: real('deal_value'),
  stage: varchar('stage', { length: 50 }).notNull(),
  closedReason: varchar('closed_reason', { length: 100 }),
  timeDecayScore: real('time_decay_score'),
  resurrectionEligible: boolean('resurrection_eligible').notNull().default(false),
  lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const outboundCampaigns = pgTable('outbound_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  icpProfileId: uuid('icp_profile_id').references(() => icpProfiles.id, { onDelete: 'set null' }),
  platform: varchar('platform', { length: 50 }),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  emailSequence: jsonb('email_sequence').notNull().default([]),
  dailySendLimit: integer('daily_send_limit').notNull().default(50),
  totalSent: integer('total_sent').notNull().default(0),
  totalReplied: integer('total_replied').notNull().default(0),
  totalBounced: integer('total_bounced').notNull().default(0),
  expertPanelScore: real('expert_panel_score'),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const financialReports = pgTable('financial_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  reportType: varchar('report_type', { length: 50 }).notNull(),
  period: varchar('period', { length: 20 }).notNull(),
  kpis: jsonb('kpis').notNull().default({}),
  anomalies: jsonb('anomalies').notNull().default([]),
  recommendations: jsonb('recommendations').notNull().default([]),
  rawData: jsonb('raw_data').notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const podcastEpisodes = pgTable('podcast_episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 300 }).notNull(),
  feedUrl: varchar('feed_url', { length: 500 }),
  audioUrl: varchar('audio_url', { length: 500 }),
  transcriptUrl: varchar('transcript_url', { length: 500 }),
  transcript: text('transcript'),
  contentAtoms: jsonb('content_atoms').notNull().default([]),
  generatedContent: jsonb('generated_content').notNull().default([]),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contentCalendar = pgTable('content_calendar', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contentId: varchar('content_id', { length: 100 }),
  platform: varchar('platform', { length: 50 }).notNull(),
  contentType: varchar('content_type', { length: 50 }).notNull(),
  title: varchar('title', { length: 300 }).notNull(),
  content: text('content'),
  viralScore: real('viral_score'),
  status: varchar('status', { length: 20 }).notNull().default('scheduled'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const salesCallInsights = pgTable('sales_call_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  callId: varchar('call_id', { length: 100 }),
  dealId: uuid('deal_id').references(() => dealRecords.id, { onDelete: 'set null' }),
  overallScore: real('overall_score'),
  buyingSignals: jsonb('buying_signals').notNull().default([]),
  objections: jsonb('objections').notNull().default([]),
  dealProbability: real('deal_probability'),
  upsellOpportunities: jsonb('upsell_opportunities').notNull().default([]),
  criteriaScores: jsonb('criteria_scores').notNull().default({}),
  summary: text('summary'),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const revenueAttributions = pgTable('revenue_attributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contentId: varchar('content_id', { length: 100 }),
  contentType: varchar('content_type', { length: 50 }),
  channel: varchar('channel', { length: 50 }).notNull(),
  attributionModel: varchar('attribution_model', { length: 30 }).notNull(),
  revenue: real('revenue').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  cpa: real('cpa'),
  period: varchar('period', { length: 20 }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const croAudits = pgTable('cro_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pageUrl: varchar('page_url', { length: 500 }).notNull(),
  pageType: varchar('page_type', { length: 50 }),
  overallScore: real('overall_score').notNull(),
  dimensionScores: jsonb('dimension_scores').notNull().default({}),
  issues: jsonb('issues').notNull().default([]),
  recommendations: jsonb('recommendations').notNull().default([]),
  industry: varchar('industry', { length: 50 }),
  auditedAt: timestamp('audited_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ytCompetitiveData = pgTable('yt_competitive_data', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  channelId: varchar('channel_id', { length: 100 }).notNull(),
  channelName: varchar('channel_name', { length: 200 }).notNull(),
  videoCount: integer('video_count').notNull().default(0),
  avgViews: real('avg_views'),
  avgLongFormViews: real('avg_long_form_views'),
  avgShortsViews: real('avg_shorts_views'),
  outlierVideos: jsonb('outlier_videos').notNull().default([]),
  titlePatterns: jsonb('title_patterns').notNull().default([]),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }).notNull().defaultNow(),
});
