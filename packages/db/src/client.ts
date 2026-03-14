import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
const verifiedRoleAvailability = new Map<string, boolean>();
const warnedMissingRoles = new Set<string>();

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

function quotePgIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

async function canApplyLocalRole(transaction: any, appRole: string): Promise<boolean> {
  const normalizedRole = appRole.trim();
  if (!normalizedRole) {
    return false;
  }

  const cachedAvailability = verifiedRoleAvailability.get(normalizedRole);
  if (cachedAvailability !== undefined) {
    return cachedAvailability;
  }

  try {
    const result = await transaction<{ roleExists: boolean }[]>`
      select exists(
        select 1
        from pg_roles
        where rolname = ${normalizedRole}
      ) as "roleExists"
    `;
    const roleExists = Boolean(result[0]?.roleExists);
    verifiedRoleAvailability.set(normalizedRole, roleExists);

    if (!roleExists && !warnedMissingRoles.has(normalizedRole)) {
      warnedMissingRoles.add(normalizedRole);
      console.warn(
        `[db] DATABASE_APP_ROLE "${normalizedRole}" does not exist in this database; skipping SET LOCAL ROLE and relying on tenant-scoped queries.`,
      );
    }

    return roleExists;
  } catch (error) {
    if (!warnedMissingRoles.has(normalizedRole)) {
      warnedMissingRoles.add(normalizedRole);
      console.warn(
        `[db] Failed to verify DATABASE_APP_ROLE "${normalizedRole}"; skipping SET LOCAL ROLE.`,
        error,
      );
    }

    verifiedRoleAvailability.set(normalizedRole, false);
    return false;
  }
}

export async function applyTenantSession<T>(
  transaction: any,
  tenantId: string,
  callback: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>,
  options: { appRole?: string; enforceRls?: boolean } = {},
): Promise<T> {
  const appRole = (options.appRole ?? process.env.DATABASE_APP_ROLE ?? '').trim();
  const enforceRls = options.enforceRls ?? (appRole ? process.env.DB_ENFORCE_RLS !== 'false' : false);

  await transaction`select set_config('app.current_tenant_id', ${tenantId}, true)`;

  if (enforceRls && appRole && await canApplyLocalRole(transaction, appRole)) {
    await transaction.unsafe(`set local role ${quotePgIdentifier(appRole)}`);
  }

  const scopedDb = drizzle(transaction as any, { schema }) as ReturnType<typeof drizzle<typeof schema>>;
  return callback(scopedDb);
}

export async function executeWithTenantSession<T>(
  tenantId: string,
  callback: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>,
): Promise<T> {
  const sql = getPostgresClient();

  return await sql.begin(async (transaction) => applyTenantSession(transaction as any, tenantId, callback)) as T;
}

/**
 * Execute a callback with a tenant-scoped DB instance.
 */
export async function withTenantDb<T>(
  tenantId: string,
  callback: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>,
): Promise<T> {
  return executeWithTenantSession(tenantId, callback);
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
