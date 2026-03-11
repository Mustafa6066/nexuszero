/**
 * Google OAuth Handler — Handles GA4, Google Ads, and Search Console.
 * Google uses a single OAuth client with different scope sets.
 */

import type { OAuthTokens, ConnectionResult, Platform } from '@nexuszero/shared';
import { exchangeCode, generateAuthUrl, generateOAuthState, generatePKCE } from '../oauth-manager.js';
import { createIntegration } from '../token-vault.js';

/** Google scope sets for different products */
export const GOOGLE_SCOPE_SETS: Record<string, string[]> = {
  google_analytics: [
    'https://www.googleapis.com/auth/analytics.readonly',
  ],
  google_ads: [
    'https://www.googleapis.com/auth/adwords',
  ],
  google_search_console: [
    'https://www.googleapis.com/auth/webmasters.readonly',
  ],
};

/** Generate a combined Google auth URL for multiple products */
export function generateGoogleAuthUrl(
  state: string,
  products: Platform[],
): string {
  const allScopes = products.flatMap(p => GOOGLE_SCOPE_SETS[p] ?? []);
  const uniqueScopes = [...new Set(allScopes)];
  // All Google products use the same OAuth endpoint
  return generateAuthUrl('google_analytics', state, uniqueScopes);
}

/** Connect a Google product after code exchange */
export async function connectGoogleProduct(
  tenantId: string,
  platform: Platform,
  code: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  try {
    const tokens = await exchangeCode(platform, code);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: platform === 'google_ads' ? 'v17' : 'v1',
      scopesRequired: GOOGLE_SCOPE_SETS[platform] ?? [],
    });

    return {
      success: true,
      platform,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
    };
  } catch (error) {
    return {
      success: false,
      platform,
      scopes: [],
      expiresAt: new Date(0),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Verify Google token is still valid */
export async function verifyGoogleToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    return response.ok;
  } catch {
    return false;
  }
}
