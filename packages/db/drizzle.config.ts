import type { Config } from 'drizzle-kit';

export default {
  schema: ['./src/schema/agents.ts','./src/schema/analytics.ts','./src/schema/aeo-citations.ts','./src/schema/api-keys.ts','./src/schema/audit-logs.ts','./src/schema/campaigns.ts','./src/schema/compound-insights.ts','./src/schema/creative-tests.ts','./src/schema/creatives.ts','./src/schema/integration-health.ts','./src/schema/integrations.ts','./src/schema/oauth-tokens.ts','./src/schema/schema-snapshots.ts','./src/schema/tenants.ts','./src/schema/users.ts','./src/schema/webhooks.ts','./src/schema/agent-tasks.ts','./src/schema/approval-queue.ts','./src/schema/alert-rules.ts','./src/schema/login-streaks.ts','./src/schema/agent-actions.ts','./src/schema/campaign-versions.ts'],
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://nexuszero:localdev@localhost:5432/nexuszero',
  },
} satisfies Config;
