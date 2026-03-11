import type { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { sha256Hash, AppError } from '@nexuszero/shared';
import { getDb, apiKeys, users } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';

export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
    authMethod: 'jwt' | 'api-key';
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set. Refusing to start with an insecure secret.');
}

export function signJwt(payload: AuthUser): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyJwt(token: string): AuthUser {
  return jwt.verify(token, JWT_SECRET) as AuthUser;
}

export const authMiddleware = async (c: Context, next: Next) => {
  // Try API key first
  const apiKeyHeader = c.req.header('X-API-Key');
  if (apiKeyHeader) {
    const db = getDb();
    const keyHash = sha256Hash(apiKeyHeader);
    const [key] = await db.select().from(apiKeys).where(
      and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true))
    ).limit(1);

    if (!key) {
      throw new AppError('AUTH_INVALID_API_KEY');
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      throw new AppError('AUTH_INVALID_TOKEN', { reason: 'API key expired' });
    }

    // Derive role from the key's scopes rather than blindly granting 'admin'
    const scopes = Array.isArray(key.scopes) ? key.scopes as string[] : [];
    const role = scopes.includes('admin') ? 'admin' : scopes.includes('write') ? 'member' : 'viewer';
    c.set('user', {
      userId: `api-key:${key.id}`,
      tenantId: key.tenantId,
      email: '',
      role,
    });
    c.set('authMethod', 'api-key');
    return next();
  }

  // Try JWT
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('AUTH_REQUIRED');
  }

  const token = authHeader.substring(7);
  try {
    const payload = verifyJwt(token);
    c.set('user', payload);
    c.set('authMethod', 'jwt');
  } catch {
    throw new AppError('AUTH_INVALID_TOKEN');
  }

  return next();
};
