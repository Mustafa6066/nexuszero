import { pgTable, uuid, integer, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { integrations } from './integrations.js';
import { tenants } from './tenants.js';

export const healthCheckTypeEnum = pgEnum('health_check_type', [
  'ping', 'auth', 'scope', 'schema', 'rate_limit',
]);

export const healthCheckStatusEnum = pgEnum('health_check_status', [
  'pass', 'warn', 'fail',
]);

export const integrationHealth = pgTable('integration_health', {
  id: uuid('id').primaryKey().defaultRandom(),
  integrationId: uuid('integration_id').notNull().references(() => integrations.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  checkType: healthCheckTypeEnum('check_type').notNull(),
  status: healthCheckStatusEnum('status').notNull(),
  latencyMs: integer('latency_ms').notNull().default(0),
  details: jsonb('details').notNull().default({}),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});
