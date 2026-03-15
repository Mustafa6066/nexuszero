/**
 * Universal Onboarding Orchestrator — The "professional engineer" that can onboard
 * ANY platform into NexusZero. Combines the Platform Intelligence Engine with the
 * Dynamic Connector to handle platforms that have no hardcoded connector.
 *
 * Flow for unknown platforms:
 *  1. User provides platform name/URL → LLM analyzes it → produces Blueprint
 *  2. Blueprint stored in Knowledge Base for reuse
 *  3. DynamicConnector created from Blueprint
 *  4. Credentials validated via health check
 *  5. Integration created in DB → agents activated
 *
 * Flow for known platforms:
 *  1. Standard flow via hardcoded connectors (unchanged)
 *
 * The orchestrator is smart enough to determine which flow to use.
 */

import { eq, and } from 'drizzle-orm';
import { getDb, integrations, tenants } from '@nexuszero/db';
import type { Platform } from '@nexuszero/shared';

import { analyzePlatform, generateConnectionStrategy, diagnoseConnectionFailure } from '../intelligence/platform-analyzer.js';
import type { PlatformBlueprint, AnalysisRequest } from '../intelligence/platform-analyzer.js';
import { storeBlueprint, getBlueprint, searchBlueprints, updateBlueprintConfidence } from '../intelligence/platform-knowledge.js';
import { DynamicConnector } from '../connectors/dynamic/dynamic-connector.js';
import { hasConnector } from '../connectors/connector-registry.js';
import { extractBrandProfile } from './brand-extractor.js';
import { planAgentActivation } from './agent-activator.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UniversalOnboardingRequest {
  tenantId: string;
  websiteUrl?: string;
  platforms: PlatformOnboardingRequest[];
}

export interface PlatformOnboardingRequest {
  platformName: string;
  platformUrl?: string;
  docsUrl?: string;
  credentials: Record<string, string>;
  context?: string;
}

export interface PlatformOnboardingResult {
  platformId: string;
  platformName: string;
  status: 'connected' | 'failed' | 'needs_oauth';
  isNative: boolean;
  blueprint?: PlatformBlueprint;
  connectionStrategy?: string;
  error?: string;
  diagnosis?: { diagnosis: string; suggestedFix: string; shouldRetry: boolean };
  integrationId?: string;
}

export interface UniversalOnboardingResult {
  tenantId: string;
  results: PlatformOnboardingResult[];
  brandProfile?: Awaited<ReturnType<typeof extractBrandProfile>>;
  activatedAgents: string[];
  overallStatus: 'success' | 'partial' | 'failed';
  summary: string;
}

// ── Active dynamic connectors (per-tenant, keyed by platformId) ─────────────

const dynamicConnectors = new Map<string, DynamicConnector>();

export function getDynamicConnector(platformId: string): DynamicConnector | undefined {
  return dynamicConnectors.get(platformId);
}

// ── Core Orchestration ──────────────────────────────────────────────────────

/** Run the full universal onboarding flow for one or more platforms */
export async function runUniversalOnboarding(req: UniversalOnboardingRequest): Promise<UniversalOnboardingResult> {
  const results: PlatformOnboardingResult[] = [];

  // Extract brand profile if website URL provided
  let brandProfile: Awaited<ReturnType<typeof extractBrandProfile>> | undefined;
  if (req.websiteUrl) {
    try {
      const html = await fetchSafe(req.websiteUrl);
      if (html) {
        brandProfile = await extractBrandProfile(req.websiteUrl, html);
      }
    } catch {
      // Brand extraction is non-critical
    }
  }

  // Process each platform (in parallel, max 3 concurrent)
  const batchSize = 3;
  for (let i = 0; i < req.platforms.length; i += batchSize) {
    const batch = req.platforms.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((p) => onboardSinglePlatform(req.tenantId, p)),
    );
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          platformId: 'unknown',
          platformName: 'unknown',
          status: 'failed',
          isNative: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  // Determine which agents to activate based on all connected platforms
  const db = getDb();
  const connectedRows = await db
    .select({ platform: integrations.platform })
    .from(integrations)
    .where(and(eq(integrations.tenantId, req.tenantId), eq(integrations.status, 'connected')));
  const connectedPlatforms = connectedRows.map((r) => r.platform as Platform);
  const plan = planAgentActivation(connectedPlatforms);

  // Count successes
  const connected = results.filter((r) => r.status === 'connected').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const total = results.length;

  const overallStatus = connected === total ? 'success' : connected > 0 ? 'partial' : 'failed';

  return {
    tenantId: req.tenantId,
    results,
    brandProfile,
    activatedAgents: plan.agentsToActivate,
    overallStatus,
    summary: `Onboarded ${connected}/${total} platforms. ${failed > 0 ? `${failed} failed.` : ''} Agents: ${plan.agentsToActivate.join(', ')}`,
  };
}

/** Onboard a single platform — determines if it's native or dynamic, then connects */
async function onboardSinglePlatform(
  tenantId: string,
  req: PlatformOnboardingRequest,
): Promise<PlatformOnboardingResult> {
  const normalizedName = req.platformName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // 1. Check if it's a native (hardcoded) platform
  if (hasConnector(normalizedName as Platform)) {
    return onboardNativePlatform(tenantId, normalizedName as Platform, req);
  }

  // 2. Check knowledge base for a previously learned blueprint
  let blueprint = await getBlueprint(normalizedName);

  // 3. If not found, analyze the platform with AI
  if (!blueprint) {
    const searchResults = await searchBlueprints(req.platformName);
    if (searchResults.length > 0) {
      blueprint = searchResults[0]!;
    }
  }

  if (!blueprint) {
    try {
      const analysisReq: AnalysisRequest = {
        platformName: req.platformName,
        platformUrl: req.platformUrl,
        docsUrl: req.docsUrl,
        context: req.context,
      };
      blueprint = await analyzePlatform(analysisReq);
      await storeBlueprint(blueprint);
    } catch (error) {
      return {
        platformId: normalizedName,
        platformName: req.platformName,
        status: 'failed',
        isNative: false,
        error: `Platform analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // 4. If OAuth is required and no credentials provided
  if (
    (blueprint.authMethod === 'oauth2' || blueprint.authMethod === 'oauth2_pkce') &&
    !req.credentials.accessToken &&
    !req.credentials.code
  ) {
    const strategy = await generateConnectionStrategy(blueprint);
    return {
      platformId: blueprint.platformId,
      platformName: blueprint.platformName,
      status: 'needs_oauth',
      isNative: false,
      blueprint,
      connectionStrategy: strategy,
    };
  }

  // 5. Connect via DynamicConnector
  return connectDynamicPlatform(tenantId, blueprint, req);
}

/** Connect a native (hardcoded) platform using existing connector infrastructure */
async function onboardNativePlatform(
  tenantId: string,
  platform: Platform,
  req: PlatformOnboardingRequest,
): Promise<PlatformOnboardingResult> {
  const { getConnector } = await import('../connectors/connector-registry.js');
  const { createIntegration } = await import('../oauth/token-vault.js');

  const connector = getConnector(platform);
  const token = req.credentials.accessToken ?? req.credentials.apiKey ?? req.credentials.token ?? '';

  if (!token) {
    return {
      platformId: platform,
      platformName: req.platformName,
      status: 'needs_oauth',
      isNative: true,
    };
  }

  try {
    const health = await connector.healthCheck(token);
    if (!health.healthy) {
      return {
        platformId: platform,
        platformName: req.platformName,
        status: 'failed',
        isNative: true,
        error: health.error ?? 'Health check failed',
      };
    }

    const integrationId = await createIntegration({
      tenantId,
      platform,
      tokens: {
        accessToken: token,
        refreshToken: req.credentials.refreshToken ?? null,
        tokenType: req.credentials.refreshToken ? 'OAuth' : 'ApiKey',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        scopes: [],
      },
      detectedVia: 'manual_connect',
    });

    return {
      platformId: platform,
      platformName: req.platformName,
      status: 'connected',
      isNative: true,
      integrationId,
    };
  } catch (error) {
    return {
      platformId: platform,
      platformName: req.platformName,
      status: 'failed',
      isNative: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Connect a dynamic (LLM-discovered) platform */
async function connectDynamicPlatform(
  tenantId: string,
  blueprint: PlatformBlueprint,
  req: PlatformOnboardingRequest,
): Promise<PlatformOnboardingResult> {
  const { createIntegration } = await import('../oauth/token-vault.js');
  const connector = new DynamicConnector(blueprint);

  const token = req.credentials.accessToken ?? req.credentials.apiKey ?? req.credentials.token ?? req.credentials.key ?? '';

  if (!token) {
    return {
      platformId: blueprint.platformId,
      platformName: blueprint.platformName,
      status: 'failed',
      isNative: false,
      blueprint,
      error: 'No credentials provided',
    };
  }

  // Attempt connection with LLM-assisted retry and diagnosis
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const validation = await connector.validateCredentials(req.credentials);

      if (!validation.valid) {
        if (attempt < 3) {
          const diag = await diagnoseConnectionFailure(blueprint, validation.error ?? 'Validation failed', attempt);
          if (!diag.shouldRetry) {
            return {
              platformId: blueprint.platformId,
              platformName: blueprint.platformName,
              status: 'failed',
              isNative: false,
              blueprint,
              error: validation.error,
              diagnosis: diag,
            };
          }
          // LLM says retry — wait briefly
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }

        await updateBlueprintConfidence(blueprint.platformId, false);
        return {
          platformId: blueprint.platformId,
          platformName: blueprint.platformName,
          status: 'failed',
          isNative: false,
          blueprint,
          error: validation.error,
        };
      }

      // Success — persist the integration
      const integrationId = await createIntegration({
        tenantId,
        platform: blueprint.platformId as Platform,
        tokens: {
          accessToken: token,
          refreshToken: req.credentials.refreshToken ?? null,
          tokenType: blueprint.authMethod.startsWith('oauth') ? 'OAuth' : 'ApiKey',
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          scopes: blueprint.oauth?.scopes ?? [],
        },
        detectedVia: 'manual_connect',
      });

      // Cache the dynamic connector for future use
      dynamicConnectors.set(blueprint.platformId, connector);

      // Update blueprint confidence
      await updateBlueprintConfidence(blueprint.platformId, true);

      return {
        platformId: blueprint.platformId,
        platformName: blueprint.platformName,
        status: 'connected',
        isNative: false,
        blueprint,
        integrationId,
      };
    } catch (error) {
      if (attempt === 3) {
        await updateBlueprintConfidence(blueprint.platformId, false);
        return {
          platformId: blueprint.platformId,
          platformName: blueprint.platformName,
          status: 'failed',
          isNative: false,
          blueprint,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return {
    platformId: blueprint.platformId,
    platformName: blueprint.platformName,
    status: 'failed',
    isNative: false,
    blueprint,
    error: 'Connection failed after all retries',
  };
}

/** Analyze a platform without connecting — for discovery/preview */
export async function previewPlatform(req: AnalysisRequest): Promise<{
  blueprint: PlatformBlueprint;
  connectionStrategy: string;
  isNative: boolean;
}> {
  const normalizedName = req.platformName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const isNative = hasConnector(normalizedName as Platform);

  // Check knowledge base first
  let blueprint = await getBlueprint(normalizedName);
  if (!blueprint) {
    blueprint = await analyzePlatform(req);
    await storeBlueprint(blueprint);
  }

  const strategy = await generateConnectionStrategy(blueprint);

  return { blueprint, connectionStrategy: strategy, isNative };
}

// ── Safe fetch utility ──────────────────────────────────────────────────────

import { isIP } from 'node:net';
import { promises as dnsPromises } from 'node:dns';

async function fetchSafe(url: string): Promise<string | null> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const { hostname } = parsed;
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null;
  if (hostname === 'metadata.google.internal') return null;

  if (isIP(hostname)) {
    const parts = hostname.split('.');
    if (parts.length === 4) {
      const [a, b] = parts.map(Number) as [number, number];
      if (a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return null;
    }
    if (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')) return null;
  } else {
    try {
      const addrs = await dnsPromises.lookup(hostname, { all: true });
      for (const { address } of addrs) {
        const parts = address.split('.');
        if (parts.length === 4) {
          const [a, b] = parts.map(Number) as [number, number];
          if (a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return null;
        }
      }
    } catch { return null; }
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'NexusZero-Bot/1.0', Accept: 'text/html' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch { return null; }
}
