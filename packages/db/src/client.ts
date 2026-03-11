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
 * Execute a callback within a tenant-scoped RLS context.
 * Sets `app.current_tenant_id` for the duration of the transaction,
 * ensuring all queries are filtered by the tenant's RLS policies.
 */
export async function withTenantDb<T>(
  tenantId: string,
  callback: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>,
): Promise<T> {
  const sql = getPostgresClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sql.begin(async (tx: any) => {
    // Use set_config() as a parameterized call to avoid any possibility of SQL injection
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    const scopedDb = drizzle(tx, { schema });
    return callback(scopedDb);
  });
  return result as T;
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
