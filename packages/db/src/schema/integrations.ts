import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';

export const integrationPlatformEnum = pgEnum('integration_platform', [
  'google_analytics', 'google_ads', 'google_search_console', 'meta_ads',
  'linkedin_ads', 'hubspot', 'salesforce', 'wordpress', 'webflow',
  'contentful', 'shopify', 'mixpanel', 'amplitude', 'slack', 'sendgrid', 'stripe_connect',
]);

export const integrationStatusEnum = pgEnum('integration_status', [
  'connected', 'degraded', 'disconnected', 'expired', 'reconnecting',
]);

export const detectionMethodEnum = pgEnum('detection_method', [
  'auto_discovery', 'manual_connect',
]);

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  platform: integrationPlatformEnum('platform').notNull(),
  status: integrationStatusEnum('status').notNull().default('disconnected'),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  scopesGranted: text('scopes_granted').array().notNull().default(sql`'{}'`),
  scopesRequired: text('scopes_required').array().notNull().default(sql`'{}'`),
  apiVersion: varchar('api_version', { length: 50 }),
  lastSuccessfulCall: timestamp('last_successful_call', { withTimezone: true }),
  lastError: text('last_error'),
  errorCount: integer('error_count').notNull().default(0),
  healthScore: integer('health_score').notNull().default(100),
  latencyP95Ms: integer('latency_p95_ms'),
  rateLimitRemaining: integer('rate_limit_remaining'),
  rateLimitResetAt: timestamp('rate_limit_reset_at', { withTimezone: true }),
  detectedVia: detectionMethodEnum('detected_via').notNull().default('manual_connect'),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
