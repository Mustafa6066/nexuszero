/**
 * Salesforce OAuth Handler
 * Salesforce uses a per-instance OAuth flow with a custom domain.
 */

import type { ConnectionResult, Platform } from '@nexuszero/shared';
import { exchangeCode } from '../oauth-manager.js';
import { createIntegration } from '../token-vault.js';

/** Connect Salesforce CRM */
export async function connectSalesforce(
  tenantId: string,
  code: string,
  instanceUrl: string,
  detectedVia: 'auto_discovery' | 'manual_connect',
): Promise<ConnectionResult> {
  const platform: Platform = 'salesforce';
  try {
    const tokens = await exchangeCode(platform, code);

    const orgInfo = await getSalesforceOrgInfo(tokens.accessToken, instanceUrl);

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens,
      detectedVia,
      apiVersion: 'v59.0',
      config: { instanceUrl, ...orgInfo },
      scopesRequired: ['api', 'refresh_token'],
    });

    return {
      success: true,
      platform,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      accountId: integrationId,
      accountName: orgInfo.orgName,
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

/** Get Salesforce org info via Identity URL */
async function getSalesforceOrgInfo(
  accessToken: string,
  instanceUrl: string,
): Promise<{ orgId: string; orgName: string }> {
  const response = await fetch(`${instanceUrl}/services/data/v59.0/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { orgId: '', orgName: 'Salesforce' };
  }

  // The /services/data/v59.0/ endpoint returns version info; use /limits for org id
  const userInfoResp = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!userInfoResp.ok) {
    return { orgId: '', orgName: 'Salesforce' };
  }

  const data = await userInfoResp.json() as Record<string, unknown>;
  return {
    orgId: String(data.organization_id ?? ''),
    orgName: String(data.name ?? 'Salesforce'),
  };
}
