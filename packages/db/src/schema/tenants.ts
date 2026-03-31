import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan_tier', ['launchpad', 'growth', 'enterprise']);
export const tenantStatusEnum = pgEnum('tenant_status', ['pending', 'provisioning', 'active', 'suspended', 'churned']);
export const onboardingStateEnum = pgEnum('onboarding_state', [
  'created', 'initiated', 'detecting', 'connecting',
  'shadow_auditing', 'shadow_complete',
  'oauth_connecting', 'oauth_connected',
  'auditing', 'audit_complete', 'provisioning', 'provisioned',
  'strategy_generating', 'strategy_ready', 'activating', 'going_live', 'active', 'live', 'failed',
]);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 63 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  domain: text('domain'),
  plan: planEnum('plan').notNull().default('launchpad'),
  status: tenantStatusEnum('status').notNull().default('pending'),
  onboardingState: onboardingStateEnum('onboarding_state').notNull().default('created'),
  autonomyLevel: varchar('autonomy_level', { length: 20 }).notNull().default('manual'),
  settings: jsonb('settings').notNull().default({}),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  guardrails: jsonb('guardrails').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
