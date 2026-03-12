/**
 * Contentful OAuth Handler
 * Contentful uses Personal Access Tokens (CMA) or OAuth for their Management API.
 */

import type { ConnectionResult, Platform } from '@nexuszero/shared';
import { exchangeCode } from '../oauth-manager.js';
import { createIntegration } from '../token-vault.js';

/** Connect Contentful via OAuth */
export async function connectContentful(
  tenantId: string,
  code: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'contentful';
  try {
    const tokens = await exchangeCode(platform, code);
    const spaceInfo = await getContentfulSpaceInfo(tokens.accessToken);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: 'v1',
      config: spaceInfo,
      scopesRequired: ['content_management_manage'],
    });

    return {
      success: true,
      platform,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
      accountName: spaceInfo.spaceName,
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

/** Connect Contentful via Personal Access Token (CMA Token) */
export async function connectContentfulWithToken(
  tenantId: string,
  spaceId: string,
  accessToken: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'contentful';
  try {
    // Verify the token works
    const response = await fetch(`https://api.contentful.com/spaces/${spaceId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Contentful API returned ${response.status}`);
    }

    const space = await response.json() as Record<string, unknown>;

    const tokens = {
      accessToken,
      refreshToken: null, // PATs don't expire — no refresh token
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // PATs don't expire
      scopes: ['content_management_manage'],
    };

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: 'v1',
      config: { spaceId, spaceName: String(space.name ?? spaceId) },
      scopesRequired: ['content_management_manage'],
    });

    return {
      success: true,
      platform,
      scopes: ['content_management_manage'],
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
      accountName: String(space.name ?? spaceId),
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

/** Get Contentful spaces for the token */
async function getContentfulSpaceInfo(
  accessToken: string,
): Promise<{ spaceName: string; spaces: Array<{ id: string; name: string }> }> {
  const response = await fetch('https://api.contentful.com/spaces', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { spaceName: 'Contentful', spaces: [] };
  }

  const data = await response.json() as { items?: Array<Record<string, unknown>> };
  const spaces = (data.items ?? []).map((s) => ({
    id: String(s.sys && typeof s.sys === 'object' ? (s.sys as Record<string, unknown>).id : ''),
    name: String(s.name ?? ''),
  }));

  return {
    spaceName: spaces[0]?.name ?? 'Contentful',
    spaces,
  };
}
