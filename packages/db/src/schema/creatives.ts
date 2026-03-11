import { pgTable, uuid, varchar, text, real, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { campaigns } from './campaigns.js';

export const creativeTypeEnum = pgEnum('creative_type', ['image', 'video_script', 'ad_copy', 'landing_page', 'email_template']);
export const creativeStatusEnum = pgEnum('creative_status', ['draft', 'generated', 'approved', 'rejected', 'archived']);

export const creatives = pgTable('creatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  type: creativeTypeEnum('type').notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  status: creativeStatusEnum('status').notNull().default('draft'),
  content: jsonb('content').notNull().default({}),
  brandScore: real('brand_score').notNull().default(0),
  predictedCtr: real('predicted_ctr'),
  generationPrompt: text('generation_prompt').notNull(),
  generationModel: varchar('generation_model', { length: 100 }).notNull(),
  variants: jsonb('variants').notNull().default('[]'),
  tags: jsonb('tags').notNull().default('[]'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
