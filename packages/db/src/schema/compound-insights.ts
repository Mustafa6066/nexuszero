import { pgTable, uuid, varchar, text, real, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const insightTypeEnum = pgEnum('insight_type', ['performance_pattern', 'audience_behavior', 'creative_trend', 'channel_correlation', 'seasonal_pattern', 'anomaly_detection']);

export const compoundInsights = pgTable('compound_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  insightType: insightTypeEnum('insight_type').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description').notNull(),
  industry: varchar('industry', { length: 100 }),
  applicablePlans: jsonb('applicable_plans'),
  confidence: real('confidence').notNull(),
  sampleSize: integer('sample_size').notNull(),
  dataPoints: jsonb('data_points'),
  recommendations: jsonb('recommendations'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
