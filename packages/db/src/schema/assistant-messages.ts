import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { assistantSessions } from './assistant-sessions.js';
import { tenants } from './tenants.js';

export const assistantRoleEnum = pgEnum('assistant_role', ['user', 'assistant']);

export const assistantMessages = pgTable('assistant_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => assistantSessions.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  role: assistantRoleEnum('role').notNull(),
  content: text('content').notNull().default(''),
  toolCalls: jsonb('tool_calls').notNull().default([]),
  uiContext: jsonb('ui_context'),
  tokensUsed: integer('tokens_used').default(0),
  latencyMs: integer('latency_ms').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
