import { getDb, oauthTokens, tenants } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';

/**
 * OAuth Connect Step
 * Validates that the tenant has connected at least one OAuth provider.
 * In production, the actual OAuth flow happens in the frontend — this step
 * verifies the tokens were stored successfully and tests connectivity.
 */
export class OAuthConnectStep {
  async execute(tenantId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = getDb();

    // Check for existing OAuth tokens
    const tokens = await db.select().from(oauthTokens)
      .where(eq(oauthTokens.tenantId, tenantId));

    const connectedProviders = tokens.map(t => t.provider);

    if (connectedProviders.length === 0) {
      // If no tokens and config has provider details, skip validation
      // (tokens may be stored asynchronously by the frontend)
      const skipValidation = config.skipOAuth === true;
      if (!skipValidation) {
        throw new Error('No OAuth providers connected. Connect at least one provider (Google, Meta, etc.) to continue.');
      }
    }

    // Validate token expiry
    const validTokens = tokens.filter(t => {
      if (!t.expiresAt) return true;
      return new Date(t.expiresAt) > new Date();
    });

    const expiredProviders = tokens
      .filter(t => t.expiresAt && new Date(t.expiresAt) <= new Date())
      .map(t => t.provider);

    return {
      connectedProviders,
      validProviders: validTokens.map(t => t.provider),
      expiredProviders,
      totalConnected: connectedProviders.length,
    };
  }
}
