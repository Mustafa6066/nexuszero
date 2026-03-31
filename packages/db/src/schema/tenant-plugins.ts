import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// ---------------------------------------------------------------------------
// Tenant Plugins — tracks installed plugins per tenant for extensibility
// ---------------------------------------------------------------------------

export const tenantPlugins = pgTable('tenant_plugins', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

  /** Unique plugin identifier (e.g., 'nexuszero/google-analytics-connector') */
  pluginId: varchar('plugin_id', { length: 200 }).notNull(),
  /** Plugin display name */
  name: varchar('name', { length: 100 }).notNull(),
  /** Installed version */
  version: varchar('version', { length: 50 }).notNull(),

  /** Plugin configuration (JSON, tenant-specific) */
  config: jsonb('config').$type<Record<string, unknown>>().default({}),

  /** Whether the plugin is currently active */
  enabled: boolean('enabled').default(true).notNull(),

  /** Who installed the plugin */
  installedBy: uuid('installed_by'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('tenant_plugins_tenant_idx').on(table.tenantId),
  pluginIdx: index('tenant_plugins_plugin_idx').on(table.tenantId, table.pluginId),
}));
