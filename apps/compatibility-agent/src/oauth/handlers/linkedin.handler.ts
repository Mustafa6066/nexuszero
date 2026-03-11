/**
 * LinkedIn OAuth Handler
 */

import type { ConnectionResult, Platform } from '@nexuszero/shared';
import { exchangeCode } from '../oauth-manager.js';
import { createIntegration } from '../token-vault.js';

/** Connect LinkedIn Ads */
export async function connectLinkedIn(
  tenantId: string,
  code: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'linkedin_ads';
  try {
    const tokens = await exchangeCode(platform, code);

    const profile = await getLinkedInProfile(tokens.accessToken);
    const adAccounts = await getLinkedInAdAccounts(tokens.accessToken);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: '202401',
      config: { profile, adAccounts },
      scopesRequired: ['r_ads', 'r_ads_reporting', 'r_organization_social'],
    });

    return {
      success: true,
      platform,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
      accountName: profile.name,
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

/** Get LinkedIn member profile */
async function getLinkedInProfile(accessToken: string): Promise<{ sub: string; name: string }> {
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { sub: '', name: 'LinkedIn User' };
  }

  const data = await response.json() as Record<string, unknown>;
  return {
    sub: String(data.sub ?? ''),
    name: String(data.name ?? 'LinkedIn User'),
  };
}

/** Get LinkedIn Ad Accounts for the authenticated user */
async function getLinkedInAdAccounts(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch(
    'https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE)))&count=10',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!response.ok) return [];

  const data = await response.json() as { elements?: Array<{ id: string; name: string }> };
  return (data.elements ?? []).map((acct) => ({
    id: String(acct.id),
    name: String(acct.name),
  }));
}
