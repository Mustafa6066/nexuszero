import postgres from 'postgres';
import { readFileSync } from 'fs';

const DATABASE_URL = 'postgresql://postgres:XuCtJSPCvcusYkCtgptcdcXhXOiIrfPn@tramway.proxy.rlwy.net:44369/railway';

const sql = postgres(DATABASE_URL, { ssl: 'allow' });

const migrationSQL = readFileSync('./src/migrations/0000_smart_jasper_sitwell.sql', 'utf-8');

// Split on --> statement-breakpoint and run each statement
const statements = migrationSQL.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

console.log(`Running ${statements.length} statements...`);

let i = 0;
for (const stmt of statements) {
  try {
    await sql.unsafe(stmt);
    i++;
    if (i % 10 === 0) console.log(`Progress: ${i}/${statements.length}`);
  } catch (err) {
    console.error(`Error on statement ${i + 1}:`, err.message);
    i++;
  }
}

console.log(`Migration complete! Ran ${i} statements.`);
await sql.end();
