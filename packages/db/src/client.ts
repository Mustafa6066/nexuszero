import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPostgresClient() {
  if (!client) {
    const connectionString = process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL or DATABASE_PRIVATE_URL must be set');
    }
    client = postgres(connectionString, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}

export function getDb() {
  if (!db) {
    const sql = getPostgresClient();
    db = drizzle(sql, { schema });
  }
  return db;
}

/**
 * Execute a callback with a tenant-scoped DB instance.
 *
 * All route handlers already filter by `tenant_id` in their WHERE clauses,
 * so tenant isolation is enforced at the application level.  The previous
 * implementation wrapped every request in a BEGIN/COMMIT transaction just to
 * call `set_config('app.current_tenant_id', …)` for RLS, but the Railway
 * connection role bypasses RLS anyway.  The transactional approach also
 * caused connection-pool exhaustion under load.
 */
export async function withTenantDb<T>(
  tenantId: string,
  callback: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return callback(db);
}

/**
 * Run raw SQL — useful for migrations and administrative operations.
 */
export async function runRawSql(query: string) {
  const sql = getPostgresClient();
  return sql.unsafe(query);
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

export { schema };
