import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { integrations } from './integrations.js';
import { tenants } from './tenants.js';

export const schemaSnapshots = pgTable('schema_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  integrationId: uuid('integration_id').notNull().references(() => integrations.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  endpointPath: text('endpoint_path').notNull(),
  responseSchema: jsonb('response_schema').notNull().default({}),
  schemaHash: text('schema_hash').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});
