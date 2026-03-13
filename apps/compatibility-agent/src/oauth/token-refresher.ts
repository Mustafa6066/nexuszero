/**
 * Token Refresher — Proactively refreshes OAuth tokens BEFORE they expire.
 * Runs on a schedule and handles all platform-specific refresh flows.
 */

import { getDb, integrations } from '@nexuszero/db';
import { eq, and, lt, isNotNull, not } from 'drizzle-orm';
import { requirePlatformDefinition, type Platform } from '@nexuszero/shared';
import { storeTokens, retrieveTokens, isTokenExpired } from './token-vault.js';
import { env } from '../config/env.js';
import type { OAuthTokens } from '@nexuszero/shared';

const REFRESH_BUFFER_SECONDS = 300; // Refresh 5 minutes before expiry

/** Find all integrations with tokens expiring soon and refresh them */
export async function refreshExpiringTokens(): Promise<{
  refreshed: number;
  failed: Array<{ integrationId: string; platform: Platform; error: string }>;
}> {
  const db = getDb();
  const cutoff = new Date(Date.now() + REFRESH_BUFFER_SECONDS * 1000);

  // Find integrations whose tokens expire within the buffer window
  const expiring = await db
    .select()
    .from(integrations)
    .where(
      and(
        lt(integrations.tokenExpiresAt, cutoff),
        isNotNull(integrations.refreshTokenEncrypted),
        not(eq(integrations.status, 'disconnected')),
      ),
    );

  let refreshed = 0;
  const failed: Array<{ integrationId: string; platform: Platform; error: string }> = [];

  for (const integration of expiring) {
    try {
      const result = await refreshTokenForIntegration(integration.id, integration.platform);
      if (result) {
        refreshed++;
        console.log(JSON.stringify({
          level: 'info',
          msg: 'Token refreshed proactively',
          integrationId: integration.id,
          platform: integration.platform,
          tenantId: integration.tenantId,
        }));
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      failed.push({
        integrationId: integration.id,
        platform: integration.platform as Platform,
        error: errMsg,
      });

      // Increment error count
      await db.update(integrations).set({
        errorCount: integration.errorCount + 1,
        lastError: `Token refresh failed: ${errMsg}`,
        status: integration.errorCount + 1 >= 5 ? 'expired' : 'degraded',
        updatedAt: new Date(),
      }).where(eq(integrations.id, integration.id));

      console.log(JSON.stringify({
        level: 'error',
        msg: 'Token refresh failed',
        integrationId: integration.id,
        platform: integration.platform,
        tenantId: integration.tenantId,
        error: errMsg,
      }));
    }
  }

  return { refreshed, failed };
}

/** Refresh token for a specific integration */
export async function refreshTokenForIntegration(
  integrationId: string,
  platform: Platform,
): Promise<OAuthTokens | null> {
  const tokens = await retrieveTokens(integrationId);
  if (!tokens?.refreshToken) {
    return null;
  }

  const platformDef = requirePlatformDefinition(platform);
  if (!platformDef.refreshable || !platformDef.oauth) {
    return null;
  }

  const newTokens = await executeTokenRefresh(platform, tokens.refreshToken, platformDef.oauth.tokenUrl);

  await storeTokens(integrationId, newTokens);

  // Reset error state on successful refresh
  const db = getDb();
  await db.update(integrations).set({
    status: 'connected',
    errorCount: 0,
    lastError: null,
    lastSuccessfulCall: new Date(),
    updatedAt: new Date(),
  }).where(eq(integrations.id, integrationId));

  return newTokens;
}

/** Execute the actual OAuth token refresh HTTP call */
async function executeTokenRefresh(
  platform: Platform,
  refreshToken: string,
  tokenUrl: string,
): Promise<OAuthTokens> {
  const clientCredentials = getClientCredentials(platform);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientCredentials.clientId,
    client_secret: clientCredentials.clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed for ${platform}: ${response.status} ${text}`);
  }

  const data = await response.json() as Record<string, unknown>;

  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? refreshToken, // Some providers rotate refresh tokens
    tokenType: (data.token_type as string) ?? 'Bearer',
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scopes: typeof data.scope === 'string' ? (data.scope as string).split(' ') : [],
  };
}

/** Get OAuth client ID/secret for a platform from env vars */
function getClientCredentials(platform: Platform): { clientId: string; clientSecret: string } {
  const map: Partial<Record<Platform, { clientId: string; clientSecret: string }>> = {
    google_analytics: { clientId: env.googleClientId, clientSecret: env.googleClientSecret },
    google_ads: { clientId: env.googleClientId, clientSecret: env.googleClientSecret },
    google_search_console: { clientId: env.googleClientId, clientSecret: env.googleClientSecret },
    meta_ads: { clientId: env.metaAppId, clientSecret: env.metaAppSecret },
    linkedin_ads: { clientId: env.linkedinClientId, clientSecret: env.linkedinClientSecret },
    hubspot: { clientId: env.hubspotClientId, clientSecret: env.hubspotClientSecret },
    salesforce: { clientId: env.salesforceClientId, clientSecret: env.salesforceClientSecret },
    slack: { clientId: env.slackClientId, clientSecret: env.slackClientSecret },
    stripe_connect: { clientId: env.stripeClientId, clientSecret: env.stripeSecretKey },
    shopify: { clientId: env.shopifyApiKey, clientSecret: env.shopifyApiSecret },
  };

  const creds = map[platform];
  if (!creds?.clientId || !creds.clientSecret) {
    throw new Error(`Missing OAuth credentials for platform: ${platform}`);
  }
  return creds;
}

export { getClientCredentials, isTokenExpired, REFRESH_BUFFER_SECONDS };
