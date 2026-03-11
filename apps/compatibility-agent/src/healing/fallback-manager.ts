/**
 * Fallback Manager — Provides fallback strategies when a primary connector fails.
 * E.g., if Google Analytics fails, try pulling partial data from GSC.
 */

import type { Platform } from '@nexuszero/shared';
import { getConnector, hasConnector } from '../connectors/connector-registry.js';
import { retrieveTokens, getIntegrationByPlatform } from '../oauth/token-vault.js';

/** Fallback mappings: primary platform → fallback platforms */
const FALLBACK_MAP: Partial<Record<Platform, Platform[]>> = {
  google_analytics: ['google_search_console'],
  google_ads: ['meta_ads', 'linkedin_ads'],
  meta_ads: ['google_ads', 'linkedin_ads'],
  linkedin_ads: ['google_ads', 'meta_ads'],
  hubspot: ['salesforce'],
  salesforce: ['hubspot'],
  wordpress: ['webflow', 'contentful'],
  webflow: ['wordpress', 'contentful'],
  contentful: ['wordpress', 'webflow'],
};

export interface FallbackResult {
  originalPlatform: Platform;
  fallbackPlatform: Platform | null;
  available: boolean;
  reason?: string;
}

/** Find the best available fallback for a failed platform */
export async function findFallback(
  tenantId: string,
  failedPlatform: Platform,
): Promise<FallbackResult> {
  const candidates = FALLBACK_MAP[failedPlatform] ?? [];

  for (const candidate of candidates) {
    if (!hasConnector(candidate)) continue;

    const integration = await getIntegrationByPlatform(tenantId, candidate);
    if (!integration) continue;

    const tokens = await retrieveTokens(integration.id);
    if (!tokens) continue;

    // Verify the fallback is healthy
    const connector = getConnector(candidate);
    try {
      const health = await connector.healthCheck(tokens.accessToken);
      if (health.healthy) {
        return {
          originalPlatform: failedPlatform,
          fallbackPlatform: candidate,
          available: true,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    originalPlatform: failedPlatform,
    fallbackPlatform: null,
    available: false,
    reason: 'No healthy fallback available',
  };
}

/** Get all available fallbacks for a platform */
export function getFallbackCandidates(platform: Platform): Platform[] {
  return FALLBACK_MAP[platform] ?? [];
}
