/**
 * Auto Reconnector — Attempts to automatically restore failed integrations.
 * Tries: token refresh → scope re-validation → full reauth prompt.
 */

import { eq, and, lte, inArray } from 'drizzle-orm';
import { getDb, integrations } from '@nexuszero/db';
import type { Platform } from '@nexuszero/shared';
import { refreshTokenForIntegration } from '../oauth/token-refresher.js';
import { getConnector } from '../connectors/connector-registry.js';
import { retrieveTokens } from '../oauth/token-vault.js';
import { generateReauthLink } from '../oauth/reauth-flow.js';

export interface ReconnectionResult {
  integrationId: string;
  platform: Platform;
  strategy: 'token_refresh' | 'reconnect_test' | 'reauth_required';
  success: boolean;
  error?: string;
  reauthUrl?: string;
}

/** Attempt to reconnect a failed integration */
export async function attemptReconnection(
  integrationId: string,
  tenantId: string,
  platform: Platform,
): Promise<ReconnectionResult> {
  // Strategy 1: Try token refresh
  try {
    await refreshTokenForIntegration(integrationId, platform);
    const tokens = await retrieveTokens(integrationId);

    if (tokens) {
      const connector = getConnector(platform);
      const health = await connector.healthCheck(tokens.accessToken);

      if (health.healthy) {
        const db = getDb();
        await db.update(integrations)
          .set({ status: 'connected', errorCount: 0, lastSuccessfulCall: new Date() })
          .where(eq(integrations.id, integrationId));

        return {
          integrationId,
          platform,
          strategy: 'token_refresh',
          success: true,
        };
      }
    }
  } catch {
    // Token refresh failed, try next strategy
  }

  // Strategy 2: Test with existing token (might be a transient failure)
  try {
    const tokens = await retrieveTokens(integrationId);
    if (tokens) {
      const connector = getConnector(platform);
      const health = await connector.healthCheck(tokens.accessToken);

      if (health.healthy) {
        const db = getDb();
        await db.update(integrations)
          .set({ status: 'connected', errorCount: 0, lastSuccessfulCall: new Date() })
          .where(eq(integrations.id, integrationId));

        return {
          integrationId,
          platform,
          strategy: 'reconnect_test',
          success: true,
        };
      }
    }
  } catch {
    // Connection test failed
  }

  // Strategy 3: Require manual reauth
  const reauthLink = await generateReauthLink(integrationId, tenantId, platform);

  return {
    integrationId,
    platform,
    strategy: 'reauth_required',
    success: false,
    error: 'Automatic reconnection failed. Manual reauthorization required.',
    reauthUrl: reauthLink.url,
  };
}

/** Run reconnection attempts for all failed integrations */
export async function runReconnectionSweep(): Promise<ReconnectionResult[]> {
  const db = getDb();
  const failedIntegrations = await db
    .select()
    .from(integrations)
    .where(inArray(integrations.status, ['disconnected', 'expired', 'reconnecting'] as const));

  const results: ReconnectionResult[] = [];

  for (const integration of failedIntegrations) {
    const result = await attemptReconnection(
      integration.id,
      integration.tenantId,
      integration.platform as Platform,
    );
    results.push(result);
  }

  return results;
}
