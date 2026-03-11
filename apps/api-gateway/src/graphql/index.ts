import { createYoga } from 'graphql-yoga';
import { builder } from './builder.js';
import type { PothosContext } from './builder.js';
import { verifyJwt } from '../middleware/auth.js';
import { getDb, apiKeys } from '@nexuszero/db';
import { sha256Hash } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';

// Import type definitions to register them
import './types/tenant.js';
import './types/campaign.js';
import './types/agent.js';

const schema = builder.toSchema();

export const yogaHandler = createYoga<{}, PothosContext>({
  schema,
  graphqlEndpoint: '/graphql',
  // Never expose the landing page / introspection in production
  landingPage: false,
  maskedErrors: process.env.NODE_ENV === 'production',
  context: async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    const apiKeyHeader = request.headers.get('X-API-Key');

    // Try API key authentication
    if (apiKeyHeader) {
      const db = getDb();
      const keyHash = sha256Hash(apiKeyHeader);
      const [key] = await db.select().from(apiKeys).where(
        and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true))
      ).limit(1);

      if (key && !(key.expiresAt && new Date(key.expiresAt) < new Date())) {
        const scopes = Array.isArray(key.scopes) ? key.scopes as string[] : [];
        const role = scopes.includes('admin') ? 'admin' : scopes.includes('write') ? 'member' : 'viewer';
        return {
          user: { userId: `api-key:${key.id}`, tenantId: key.tenantId, email: '', role },
          tenantId: key.tenantId,
        };
      }
      return { user: undefined, tenantId: undefined };
    }

    // Try JWT authentication
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = verifyJwt(token);
        return { user: payload, tenantId: payload.tenantId };
      } catch {
        // Invalid token — return empty context; resolvers requiring auth will reject
        return { user: undefined, tenantId: undefined };
      }
    }

    return { user: undefined, tenantId: undefined };
  },
});
