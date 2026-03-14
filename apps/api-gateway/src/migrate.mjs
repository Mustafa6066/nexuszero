import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL or DATABASE_PRIVATE_URL must be set');
  process.exit(1);
}

console.log('Running database migrations...');

// Use dynamic import to load postgres
const { default: postgres } = await import('postgres');

const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes('railway.internal') ? false : 'allow',
  connect_timeout: 30,
  max: 1,
});

// Find the migrations directory - try multiple paths since working directory varies on Railway
// __dirname = apps/api-gateway/src/, so ../../../ gets to the repo root
import { readdirSync } from 'fs';

const candidateDirs = [
  join(__dirname, '../../../packages/db/src/migrations'),
  join(process.cwd(), 'packages/db/src/migrations'),
  '/app/packages/db/src/migrations',
];

const migrationsDir = candidateDirs.find(p => existsSync(p));
if (!migrationsDir) {
  console.error('Could not find migrations directory. Checked:', candidateDirs);
  // Don't fail - let the server start anyway
  process.exit(0);
}

// Discover all .sql migration files, sorted by name
const migrationFiles = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`Found ${migrationFiles.length} migration files:`, migrationFiles.join(', '));

let success = 0;
let skipped = 0;
let failed = 0;

for (const file of migrationFiles) {
  const migrationPath = join(migrationsDir, file);
  console.log('Running migration:', file);
  const migrationSQL = readFileSync(migrationPath, 'utf-8');
  const statements = migrationSQL.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    try {
      await sql.unsafe(stmt);
      success++;
    } catch (err) {
      // Most errors here are expected (duplicate_object, already exists)
      if (err.message && (err.message.includes('duplicate_object') || err.message.includes('already exists'))) {
        skipped++;
      } else {
        console.error(`[migrate] FAILED statement in ${file}: ${err.message?.substring(0, 200)}`);
        failed++;
      }
    }
  }
}

console.log(`Migration complete! ${success} applied, ${skipped} already existed, ${failed} failed.`);

const assistantBootstrapStatements = [
  `DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assistant_role') THEN
      CREATE TYPE assistant_role AS ENUM ('user', 'assistant');
    END IF;
  END
  $$;`,
  `CREATE TABLE IF NOT EXISTS assistant_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_count integer NOT NULL DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now()
  );`,
  `CREATE TABLE IF NOT EXISTS assistant_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role assistant_role NOT NULL,
    content text NOT NULL DEFAULT '',
    tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
    ui_context jsonb,
    tokens_used integer DEFAULT 0,
    latency_ms integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  );`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_sessions_tenant_user ON assistant_sessions (tenant_id, user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_messages_session_created ON assistant_messages (session_id, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_messages_tenant_session ON assistant_messages (tenant_id, session_id);`,
];

for (const stmt of assistantBootstrapStatements) {
  try {
    await sql.unsafe(stmt);
  } catch (err) {
    console.error('[migrate] FAILED assistant bootstrap:', err.message?.substring(0, 200));
  }
}

// Verify tables exist
try {
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  const names = tables.map(t => t.table_name);
  const expected = [
    'agents','agent_tasks','analytics_data_points','api_keys','audit_logs',
    'campaigns','compound_insights','creative_tests','creatives','entity_profiles',
    'forecasts','funnel_analysis','integration_health','integrations','oauth_tokens',
    'schema_snapshots','tenants','users','webhook_deliveries','webhook_endpoints',
    'aeo_citations','ai_visibility_scores','assistant_sessions','assistant_messages',
    'approval_queue','alert_rules','login_streaks',
  ];
  const missing = expected.filter(t => !names.includes(t));
  if (missing.length > 0) {
    console.error('[migrate] WARNING — missing tables:', missing.join(', '));
  } else {
    console.log('[migrate] All expected tables present:', names.length, 'total');
  }
} catch (checkErr) {
  console.warn('[migrate] Could not verify table list:', checkErr.message);
}

await sql.end();
