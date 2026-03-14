import { pgTable, uuid, integer, timestamp, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const loginStreaks = pgTable('login_streaks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastLoginDate: varchar('last_login_date', { length: 10 }), // YYYY-MM-DD
  totalLogins: integer('total_logins').notNull().default(0),
  rank: varchar('rank', { length: 20 }).notNull().default('recruit'), // recruit, operator, strategist, commander, nexus_elite
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
