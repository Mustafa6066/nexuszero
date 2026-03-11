import { pgTable, uuid, varchar, real, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { campaigns } from './campaigns.js';
import { creatives } from './creatives.js';

export const creativeTestStatusEnum = pgEnum('creative_test_status', ['draft', 'running', 'completed', 'stopped']);

export const creativeTests = pgTable('creative_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  creativeId: uuid('creative_id').notNull().references(() => creatives.id, { onDelete: 'cascade' }),
  status: creativeTestStatusEnum('status').notNull().default('draft'),
  winnerVariantId: varchar('winner_variant_id', { length: 100 }),
  confidenceLevel: real('confidence_level').notNull().default(0),
  totalImpressions: integer('total_impressions').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
