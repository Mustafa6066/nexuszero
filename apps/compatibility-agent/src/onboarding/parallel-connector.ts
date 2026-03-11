/**
 * Parallel Connector — Connects multiple platforms concurrently during onboarding.
 * Handles the OAuth callback routing and aggregates results.
 */

import type { Platform, ConnectionResult } from '@nexuszero/shared';
import { completeOAuthFlow } from '../oauth/oauth-manager.js';
import { markPlatformConnected, markPlatformFailed } from './onboarding-engine.js';
import { getConnector } from '../connectors/connector-registry.js';
import { createIntegration } from '../oauth/token-vault.js';

export interface ParallelConnectionResult {
  total: number;
  succeeded: ConnectionResult[];
  failed: Array<{ platform: Platform; error: string }>;
  pending: Platform[];
}

/** Process an OAuth callback for a specific platform during onboarding */
export async function processOAuthCallback(
  tenantId: string,
  platform: Platform,
  code: string,
  state: string,
): Promise<ConnectionResult> {
  try {
    const result = await completeOAuthFlow(tenantId, platform, code, 'auto_discovery');

    if (result.success) {
      markPlatformConnected(tenantId, platform);
    } else {
      markPlatformFailed(tenantId, platform);
    }

    return result;
  } catch (error) {
    markPlatformFailed(tenantId, platform);
    return {
      success: false,
      platform,
      scopes: [],
      expiresAt: new Date(0),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Connect multiple platforms that don't require OAuth (API key based) */
export async function connectApiKeyPlatforms(
  tenantId: string,
  platforms: Array<{ platform: Platform; credentials: Record<string, string> }>,
): Promise<ParallelConnectionResult> {
  const results: ConnectionResult[] = [];
  const failures: Array<{ platform: Platform; error: string }> = [];

  // Run connections in parallel (max 5 concurrently)
  const batchSize = 5;
  for (let i = 0; i < platforms.length; i += batchSize) {
    const batch = platforms.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async ({ platform, credentials }) => {
        const connector = getConnector(platform);
        // For API key platforms, credentials.apiKey or credentials.access_token is the key
        const accessToken = credentials.apiKey ?? credentials.access_token ?? credentials.key ?? '';
        if (!accessToken) {
          throw new Error(`No API key provided for ${platform}`);
        }
        const health = await connector.healthCheck(accessToken);
        if (!health.healthy) {
          throw new Error(`API key validation failed for ${platform}: ${health.error ?? 'unhealthy response'}`);
        }
        const integrationId = await createIntegration({
          tenantId,
          platform,
          tokens: {
            accessToken,
            refreshToken: null,
            tokenType: 'ApiKey',
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            scopes: [],
          },
          detectedVia: 'manual_connect',
        });
        return { platform, integrationId, success: true } as const;
      }),
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j]!;
      const batchItem = batch[j]!;
      if (result.status === 'fulfilled') {
        results.push({
          success: true,
          platform: batchItem.platform,
          scopes: [],
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
        markPlatformConnected(tenantId, batchItem.platform);
      } else {
        failures.push({
          platform: batchItem.platform,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  return {
    total: platforms.length,
    succeeded: results,
    failed: failures,
    pending: [],
  };
}
