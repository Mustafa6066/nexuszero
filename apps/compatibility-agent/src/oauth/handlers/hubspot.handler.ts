/**
 * HubSpot OAuth Handler
 */

import type { OAuthTokens, ConnectionResult, Platform } from '@nexuszero/shared';
import { exchangeCode } from '../oauth-manager.js';
import { createIntegration } from '../token-vault.js';

/** Connect HubSpot CRM */
export async function connectHubSpot(
  tenantId: string,
  code: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'hubspot';
  try {
    const tokens = await exchangeCode(platform, code);

    // Get HubSpot portal info
    const portalInfo = await getHubSpotPortalInfo(tokens.accessToken);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: 'v3',
      config: portalInfo,
      scopesRequired: ['crm.objects.contacts.read', 'crm.objects.deals.read', 'crm.objects.companies.read'],
    });

    return {
      success: true,
      platform,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
      accountName: portalInfo.portalName,
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

/** Get HubSpot portal information */
async function getHubSpotPortalInfo(accessToken: string): Promise<{ portalId: string; portalName: string }> {
  const response = await fetch('https://api.hubapi.com/account-info/v3/details', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { portalId: '', portalName: 'Unknown' };
  }

  const data = await response.json() as Record<string, unknown>;
  return {
    portalId: String(data.portalId ?? ''),
    portalName: String(data.accountType ?? 'HubSpot'),
  };
}
