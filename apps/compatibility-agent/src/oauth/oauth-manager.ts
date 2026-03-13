/**
 * OAuth Manager — Central OAuth lifecycle manager.
 * Orchestrates the full OAuth 2.0 flow for all platforms.
 */

import { randomBytes, createHash } from 'node:crypto';
import { requirePlatformDefinition, type Platform, type OAuthTokens, type ConnectionResult } from '@nexuszero/shared';
import { getClientCredentials } from './token-refresher.js';
import { createIntegration } from './token-vault.js';
import { env } from '../config/env.js';

/** State stored in Redis during OAuth flow */
export interface OAuthState {
  tenantId: string;
  platform: Platform;
  returnUrl: string;
  nonce: string;
  codeVerifier?: string; // For PKCE
  createdAt: number;
}

/** Generate the authorization URL for a platform */
export function generateAuthUrl(
  platform: Platform,
  state: string,
  scopes?: string[],
  codeChallenge?: string,
): string {
  const def = requirePlatformDefinition(platform);
  if (!def.oauth) {
    throw new Error(`Platform ${platform} does not use OAuth`);
  }

  const clientCreds = getClientCredentials(platform);
  const effectiveScopes = scopes ?? def.oauth.defaultScopes;

  const params = new URLSearchParams({
    client_id: clientCreds.clientId,
    redirect_uri: env.oauthCallbackUrl,
    response_type: 'code',
    scope: effectiveScopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  return `${def.oauth.authorizationUrl}?${params.toString()}`;
}

/** Exchange an authorization code for tokens */
export async function exchangeCode(
  platform: Platform,
  code: string,
  codeVerifier?: string,
): Promise<OAuthTokens> {
  const def = requirePlatformDefinition(platform);
  if (!def.oauth) {
    throw new Error(`Platform ${platform} does not use OAuth`);
  }

  const clientCreds = getClientCredentials(platform);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.oauthCallbackUrl,
    client_id: clientCreds.clientId,
    client_secret: clientCreds.clientSecret,
  });

  if (codeVerifier) {
    body.set('code_verifier', codeVerifier);
  }

  const response = await fetch(def.oauth.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth code exchange failed for ${platform}: ${response.status} ${text}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : def.tokenLifetimeSeconds || 3600;

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? null,
    tokenType: (data.token_type as string) ?? 'Bearer',
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scopes: typeof data.scope === 'string' ? (data.scope as string).split(/[\s,]+/) : [],
  };
}

/** Complete the OAuth flow: exchange code, store tokens, create integration record */
export async function completeOAuthFlow(
  tenantId: string,
  platform: Platform,
  code: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
  codeVerifier?: string,
): Promise<ConnectionResult> {
  try {
    const tokens = await exchangeCode(platform, code, codeVerifier);
    const def = requirePlatformDefinition(platform);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: def.api.currentVersion,
      scopesRequired: def.oauth?.defaultScopes ?? [],
    });

    return {
      success: true,
      platform,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      platform,
      scopes: [],
      expiresAt: new Date(0),
      error: errMsg,
    };
  }
}

/** Generate a random state parameter for OAuth */
export function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

/** Generate PKCE code verifier and challenge */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}
