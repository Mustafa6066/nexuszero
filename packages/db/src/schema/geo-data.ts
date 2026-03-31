import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, real } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const geoLocations = pgTable('geo_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  country: varchar('country', { length: 2 }).notNull(),
  region: varchar('region', { length: 100 }),
  city: varchar('city', { length: 100 }).notNull(),
  postalCode: varchar('postal_code', { length: 20 }),
  lat: real('lat'),
  lng: real('lng'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const geoRankings = pgTable('geo_rankings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id').notNull().references(() => geoLocations.id, { onDelete: 'cascade' }),
  keyword: varchar('keyword', { length: 500 }).notNull(),
  rank: integer('rank'),
  localPackRank: integer('local_pack_rank'),
  competitorRanks: jsonb('competitor_ranks').notNull().default({}),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const geoCitations = pgTable('geo_citations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  directory: varchar('directory', { length: 200 }).notNull(),
  url: text('url').notNull(),
  napConsistent: boolean('nap_consistent'),
  issues: jsonb('issues').notNull().default([]),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
