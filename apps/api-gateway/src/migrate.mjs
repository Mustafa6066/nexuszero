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

// Find the migration file - try multiple paths since working directory varies on Railway
const candidatePaths = [
  join(__dirname, '../../packages/db/src/migrations/0000_smart_jasper_sitwell.sql'),
  join(process.cwd(), 'packages/db/src/migrations/0000_smart_jasper_sitwell.sql'),
  '/app/packages/db/src/migrations/0000_smart_jasper_sitwell.sql',
];

const migrationPath = candidatePaths.find(p => existsSync(p));
if (!migrationPath) {
  console.error('Could not find migration file. Checked:', candidatePaths);
  // Don't fail - let the server start anyway
  process.exit(0);
}
console.log('Using migration file:', migrationPath);
const migrationSQL = readFileSync(migrationPath, 'utf-8');

// Split on --> statement-breakpoint and run each statement
const statements = migrationSQL.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

console.log(`Running ${statements.length} migration statements...`);

let success = 0;
let skipped = 0;
for (const stmt of statements) {
  try {
    await sql.unsafe(stmt);
    success++;
  } catch (err) {
    // Most errors here are expected (duplicate_object, etc.)
    if (err.message && (err.message.includes('duplicate_object') || err.message.includes('already exists'))) {
      skipped++;
    } else {
      console.warn(`Warning on statement ${success + skipped + 1}:`, err.message?.substring(0, 100));
      skipped++;
    }
  }
}

console.log(`Migration complete! ${success} applied, ${skipped} skipped.`);
await sql.end();
