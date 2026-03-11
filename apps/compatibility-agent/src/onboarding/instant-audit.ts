/**
 * Instant Audit — runs a quick audit of connected integrations right after onboarding.
 * Verifies tokens, permissions, confirms data access, and produces an initial health baseline.
 */

import type { Platform, HealthCheckResult } from '@nexuszero/shared';
import { getConnector } from '../connectors/connector-registry.js';
import { retrieveTokens, getIntegrationByPlatform } from '../oauth/token-vault.js';
import { validateScopes, getRequiredScopes } from '../oauth/scope-validator.js';

export interface AuditResult {
  platform: Platform;
  health: HealthCheckResult;
  scopeCheck: { valid: boolean; missing: string[] };
  dataAccessible: boolean;
}

export interface InstantAuditReport {
  tenantId: string;
  results: AuditResult[];
  overallHealth: number;
  auditedAt: Date;
}

/** Run instant audit on all connected platforms for a tenant */
export async function runInstantAudit(
  tenantId: string,
  platforms: Platform[],
): Promise<InstantAuditReport> {
  const results: AuditResult[] = [];

  // Audit all platforms in parallel
  const auditResults = await Promise.allSettled(
    platforms.map((platform) => auditPlatform(tenantId, platform)),
  );

  for (const result of auditResults) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    }
  }

  const healthyCount = results.filter((r) => r.health.healthy).length;
  const overallHealth = results.length > 0 ? healthyCount / results.length : 0;

  return {
    tenantId,
    results,
    overallHealth,
    auditedAt: new Date(),
  };
}

/** Audit a single platform */
async function auditPlatform(tenantId: string, platform: Platform): Promise<AuditResult> {
  const connector = getConnector(platform);

  const integration = await getIntegrationByPlatform(tenantId, platform);
  if (!integration) {
    return {
      platform,
      health: {
        healthy: false,
        latencyMs: 0,
        scopesValid: false,
        apiVersion: '',
        error: 'No integration found for this platform',
        checkedAt: new Date(),
      },
      scopeCheck: { valid: false, missing: [] },
      dataAccessible: false,
    };
  }

  const tokens = await retrieveTokens(integration.id);

  if (!tokens) {
    return {
      platform,
      health: {
        healthy: false,
        latencyMs: 0,
        scopesValid: false,
        apiVersion: '',
        error: 'No tokens found',
        checkedAt: new Date(),
      },
      scopeCheck: { valid: false, missing: [] },
      dataAccessible: false,
    };
  }

  // Run health check
  const health = await connector.healthCheck(tokens.accessToken);

  // Validate scopes
  const scopeResult = validateScopes(tokens.scopes ?? [], getRequiredScopes(platform));

  return {
    platform,
    health,
    scopeCheck: { valid: scopeResult.valid, missing: scopeResult.missing },
    dataAccessible: health.healthy && scopeResult.valid,
  };
}
