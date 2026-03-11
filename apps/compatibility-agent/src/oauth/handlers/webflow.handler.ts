/**
 * Webflow OAuth Handler
 */

import type { ConnectionResult, Platform } from '@nexuszero/shared';
import { exchangeCode } from '../oauth-manager.js';
import { createIntegration } from '../token-vault.js';

/** Connect Webflow */
export async function connectWebflow(
  tenantId: string,
  code: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'webflow';
  try {
    const tokens = await exchangeCode(platform, code);
    const siteInfo = await getWebflowSiteInfo(tokens.accessToken);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: 'v2',
      config: siteInfo,
      scopesRequired: ['sites:read', 'pages:read', 'custom_code:read', 'custom_code:write'],
    });

    return {
      success: true,
      platform,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
      accountName: siteInfo.siteName,
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

/** Get Webflow authorized info and sites */
async function getWebflowSiteInfo(
  accessToken: string,
): Promise<{ userId: string; siteName: string; sites: Array<{ id: string; name: string; shortName: string }> }> {
  // Get authorized user
  const authResp = await fetch('https://api.webflow.com/v2/token/authorized_by', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  let userId = '';
  if (authResp.ok) {
    const authData = await authResp.json() as Record<string, unknown>;
    userId = String(authData.id ?? '');
  }

  // Get sites
  const sitesResp = await fetch('https://api.webflow.com/v2/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  const sites: Array<{ id: string; name: string; shortName: string }> = [];
  if (sitesResp.ok) {
    const sitesData = await sitesResp.json() as { sites?: Array<Record<string, unknown>> };
    for (const site of sitesData.sites ?? []) {
      sites.push({
        id: String(site.id ?? ''),
        name: String(site.displayName ?? site.shortName ?? ''),
        shortName: String(site.shortName ?? ''),
      });
    }
  }

  return {
    userId,
    siteName: sites[0]?.name ?? 'Webflow',
    sites,
  };
}
