/**
 * Meta OAuth Handler — Handles Meta Marketing API (Facebook/Instagram Ads).
 */

import type { OAuthTokens, ConnectionResult, Platform } from '@nexuszero/shared';
import { exchangeCode } from '../oauth-manager.js';
import { createIntegration } from '../token-vault.js';
import { env } from '../../config/env.js';

/** Exchange short-lived Meta token for long-lived token */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: env.metaAppId,
    client_secret: env.metaAppSecret,
    fb_exchange_token: shortLivedToken,
  });

  const response = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meta long-lived token exchange failed: ${response.status} ${text}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 5184000;

  return {
    accessToken: data.access_token as string,
    refreshToken: null, // Meta long-lived tokens don't have refresh tokens
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scopes: [],
  };
}

/** Connect Meta Ads */
export async function connectMetaAds(
  tenantId: string,
  code: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'meta_ads';
  try {
    // Exchange code for short-lived token
    const shortLivedTokens = await exchangeCode(platform, code);
    // Exchange for long-lived token
    const tokens = await exchangeForLongLivedToken(shortLivedTokens.accessToken);

    // Get the ad account ID
    const accountInfo = await getMetaAdAccount(tokens.accessToken);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: 'v19.0',
      config: accountInfo,
      scopesRequired: ['ads_read', 'ads_management', 'business_management'],
    });

    return {
      success: true,
      platform,
      scopes: ['ads_read', 'ads_management', 'business_management'],
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
      accountName: accountInfo.accountName,
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

/** Get the primary ad account for the connected user */
async function getMetaAdAccount(accessToken: string): Promise<{ accountId: string; accountName: string }> {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id&limit=1&access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(10000) },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Meta ad accounts: ${response.status}`);
  }

  const data = await response.json() as { data: Array<{ name: string; account_id: string }> };
  const account = data.data[0];
  return {
    accountId: account?.account_id ?? '',
    accountName: account?.name ?? 'Unknown',
  };
}

/** Debug token to check permissions */
export async function debugMetaToken(accessToken: string): Promise<string[]> {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(10000) },
  );

  if (!response.ok) return [];

  const data = await response.json() as { data: Array<{ permission: string; status: string }> };
  return data.data
    .filter(p => p.status === 'granted')
    .map(p => p.permission);
}
