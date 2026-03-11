import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';

// Discovery
import { detectTechStack } from './discovery/stack-detector.js';

// Onboarding
import {
  initiateOnboarding,
  runDetection,
  generateConnectionUrls,
  markPlatformConnected,
  markPlatformFailed,
  transitionToActivating,
  completeOnboarding,
} from './onboarding/onboarding-engine.js';
import { processOAuthCallback, connectApiKeyPlatforms } from './onboarding/parallel-connector.js';
import { runInstantAudit } from './onboarding/instant-audit.js';
import { planAgentActivation, activateAgents } from './onboarding/agent-activator.js';

// OAuth
import { generateAuthUrl, exchangeCode, completeOAuthFlow } from './oauth/oauth-manager.js';
import { refreshExpiringTokens } from './oauth/token-refresher.js';
import { validateScopes, getRequiredScopes } from './oauth/scope-validator.js';
import { generateReauthLink, processReauthCallback } from './oauth/reauth-flow.js';

// Health
import { runHealthSweep } from './health/health-monitor.js';
import { getHealthSummary } from './health/health-reporter.js';

// Schema
import { refreshSchemaSnapshots } from './schema/schema-tracker.js';
import { checkSchemaDrift } from './schema/drift-detector.js';

// Healing
import { runHealingCycle } from './healing/healing-orchestrator.js';
import { attemptReconnection } from './healing/auto-reconnector.js';

// Connectors
import { getConnector, hasConnector } from './connectors/connector-registry.js';
import { retrieveTokens, getIntegrationByPlatform } from './oauth/token-vault.js';
import { getDb, integrations as integrationsTable } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';

// Rate limits
import { isNearRateLimit } from './health/rate-limit-tracker.js';

import type { Platform } from '@nexuszero/shared';

export class CompatibilityWorker extends BaseAgentWorker {
  readonly agentType = 'compatibility' as const;

  constructor() {
    super({
      baseQueueName: 'compatibility-tasks',
      concurrency: 5,
      heartbeatIntervalMs: 15_000,
      agentLabel: 'compatibility',
    });
  }

  protected async processTask(
    task: TaskPayload,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const { taskType, payload, tenantId } = task;

    switch (taskType) {
      // ── Discovery ──
      case 'tech_stack_detection':
        return this.handleTechStackDetection(tenantId, payload, job);

      // ── Onboarding ──
      case 'onboarding_flow':
        return this.handleOnboardingFlow(tenantId, payload, job);
      case 'tenant_provision':
        return this.handleTenantProvision(tenantId, payload, job);
      case 'agent_activate':
        return this.handleAgentActivation(tenantId, payload, job);

      // ── OAuth ──
      case 'oauth_connect':
        return this.handleOAuthConnect(tenantId, payload, job);
      case 'oauth_refresh':
        return this.handleOAuthRefresh(tenantId, payload, job);
      case 'permission_recovery':
        return this.handlePermissionRecovery(tenantId, payload, job);

      // ── Health ──
      case 'health_check':
        return this.handleHealthCheck(tenantId, payload, job);
      case 'rate_limit_check':
        return this.handleRateLimitCheck(tenantId, payload, job);

      // ── Schema ──
      case 'schema_snapshot':
        return this.handleSchemaSnapshot(tenantId, payload, job);
      case 'drift_detection':
        return this.handleDriftDetection(tenantId, payload, job);
      case 'api_version_check':
        return this.handleApiVersionCheck(tenantId, payload, job);

      // ── Healing ──
      case 'auto_reconnect':
        return this.handleAutoReconnect(tenantId, payload, job);

      // ── Connector proxy ──
      case 'connector_request':
        return this.handleConnectorRequest(tenantId, payload, job);

      // ── Strategy ──
      case 'strategy_generate':
        return this.handleStrategyGenerate(tenantId, payload, job);

      // ── Tool migration (future) ──
      case 'tool_migration':
        return { status: 'not_implemented', message: 'Tool migration is planned for a future release' };

      default:
        throw new Error(`Unknown compatibility task type: ${taskType}`);
    }
  }

  // ────────────────────── Discovery ──────────────────────

  private async handleTechStackDetection(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const websiteUrl = payload.websiteUrl as string;
    if (!websiteUrl) throw new Error('websiteUrl is required for tech_stack_detection');

    await job.updateProgress(10);
    const detection = await detectTechStack(websiteUrl);
    await job.updateProgress(100);

    return {
      websiteUrl,
      platforms: detection.platforms,
      confidence: detection.confidence,
      analyzedAt: detection.analyzedAt,
    };
  }

  // ────────────────────── Onboarding ──────────────────────

  private async handleOnboardingFlow(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const step = payload.step as string;
    const websiteUrl = payload.websiteUrl as string | undefined;

    switch (step) {
      case 'initiate': {
        if (!websiteUrl) throw new Error('websiteUrl required to initiate onboarding');
        const session = await initiateOnboarding(tenantId, websiteUrl);
        await job.updateProgress(20);

        const detection = await runDetection(tenantId);
        await job.updateProgress(50);

        const urls = await generateConnectionUrls(tenantId);
        await job.updateProgress(60);

        return {
          sessionId: tenantId,
          state: session.state,
          detection,
          connectionUrls: urls,
        };
      }
      case 'oauth_callback': {
        const platform = payload.platform as Platform;
        const code = payload.code as string;
        const state = payload.state as string;
        await processOAuthCallback(tenantId, platform, code, state);
        await markPlatformConnected(tenantId, platform);
        await job.updateProgress(80);
        return { platform, status: 'connected' };
      }
      case 'connect_api_keys': {
        const apiKeys = payload.apiKeys as Array<{ platform: Platform; credentials: Record<string, string> }>;
        const results = await connectApiKeyPlatforms(tenantId, apiKeys);
        await job.updateProgress(80);
        return { results };
      }
      case 'audit': {
        await transitionToActivating(tenantId);
        const db = getDb();
        const connectedAuditRows = await db
          .select({ platform: integrationsTable.platform })
          .from(integrationsTable)
          .where(and(eq(integrationsTable.tenantId, tenantId), eq(integrationsTable.status, 'connected')));
        const auditPlatforms = connectedAuditRows.map((r) => r.platform as Platform);
        const audit = await runInstantAudit(tenantId, auditPlatforms);
        await job.updateProgress(90);
        return audit as unknown as Record<string, unknown>;
      }
      case 'complete': {
        const db = getDb();
        const connectedRows = await db
          .select({ platform: integrationsTable.platform })
          .from(integrationsTable)
          .where(and(eq(integrationsTable.tenantId, tenantId), eq(integrationsTable.status, 'connected')));
        const platforms = connectedRows.map((r) => r.platform as Platform);
        const activatedAgents = await activateAgents(tenantId, platforms);
        const plan = planAgentActivation(platforms);
        await completeOnboarding(tenantId);
        await job.updateProgress(100);
        return { status: 'live', agents: activatedAgents, platformCoverage: plan.platformCoverage };
      }
      default:
        throw new Error(`Unknown onboarding step: ${step}`);
    }
  }

  private async handleTenantProvision(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const websiteUrl = payload.websiteUrl as string;
    if (!websiteUrl) throw new Error('websiteUrl required for tenant_provision');

    await job.updateProgress(10);
    const session = await initiateOnboarding(tenantId, websiteUrl);
    const detection = await runDetection(tenantId);
    await job.updateProgress(50);

    return {
      state: session.state,
      detectedPlatforms: detection.platforms,
    };
  }

  private async handleAgentActivation(
    tenantId: string,
    _payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const db = getDb();
    const connectedRows = await db
      .select({ platform: integrationsTable.platform })
      .from(integrationsTable)
      .where(and(eq(integrationsTable.tenantId, tenantId), eq(integrationsTable.status, 'connected')));
    const platforms = connectedRows.map((r) => r.platform as Platform);
    const plan = planAgentActivation(platforms);
    await job.updateProgress(50);
    const activatedAgents = await activateAgents(tenantId, platforms);
    await job.updateProgress(100);
    return { activatedAgents, platformCoverage: plan.platformCoverage };
  }

  // ────────────────────── OAuth ──────────────────────

  private async handleOAuthConnect(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const platform = payload.platform as Platform;

    if (payload.code) {
      // Exchange authorization code
      const code = payload.code as string;
      const result = await completeOAuthFlow(tenantId, platform, code, 'manual_connect');
      await job.updateProgress(100);
      return result as unknown as Record<string, unknown>;
    }

    // Generate auth URL
    const authUrl = await generateAuthUrl(platform, tenantId);
    await job.updateProgress(100);
    return { authUrl, platform };
  }

  private async handleOAuthRefresh(
    _tenantId: string,
    _payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const result = await refreshExpiringTokens();
    await job.updateProgress(100);
    return { refreshedCount: result.refreshed, failedCount: result.failed.length };
  }

  private async handlePermissionRecovery(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const platform = payload.platform as Platform;
    const requiredActions = (payload.actions ?? []) as string[];

    // Look up the integration to get its granted scopes
    const integration = await getIntegrationByPlatform(tenantId, platform);
    if (!integration) throw new Error(`No integration found for ${platform}`);

    const requiredScopes = getRequiredScopes(platform);
    const scopeResult = validateScopes(integration.scopesGranted ?? [], requiredScopes);
    await job.updateProgress(50);

    if (!scopeResult.valid) {
      const reauthLink = await generateReauthLink(integration.id, tenantId, platform, scopeResult.missing);
      await job.updateProgress(100);
      return {
        valid: false,
        missingScopes: scopeResult.missing,
        reauthUrl: reauthLink.url,
        expiresAt: reauthLink.expiresAt,
      };
    }

    await job.updateProgress(100);
    return { valid: true, scopes: scopeResult.granted };
  }

  // ────────────────────── Health ──────────────────────

  private async handleHealthCheck(
    _tenantId: string,
    _payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    await runHealthSweep();
    await job.updateProgress(80);
    // Return a summary scoped by the worker's tenantId context
    const summary = await getHealthSummary(_tenantId);
    await job.updateProgress(100);
    return summary;
  }

  private async handleRateLimitCheck(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const platform = payload.platform as Platform;
    const nearLimit = await isNearRateLimit(tenantId, platform);
    await job.updateProgress(100);
    return { platform, nearLimit };
  }

  // ────────────────────── Schema ──────────────────────

  private async handleSchemaSnapshot(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    // If a specific platform was supplied, snapshot only that integration
    if (payload.platform) {
      const platform = payload.platform as Platform;
      const integration = await getIntegrationByPlatform(tenantId, platform);
      if (!integration) throw new Error(`No integration found for ${platform}`);
      await refreshSchemaSnapshots(tenantId, integration.id, platform);
    }
    await job.updateProgress(100);
    return { status: 'snapshots_refreshed' };
  }

  private async handleDriftDetection(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const platform = payload.platform as Platform;
    const endpoint = payload.endpoint as string;
    if (!platform || !endpoint) throw new Error('platform and endpoint required for drift_detection');

    const integration = await getIntegrationByPlatform(tenantId, platform);
    if (!integration) throw new Error(`No integration found for ${platform}`);
    const tokens = await retrieveTokens(integration.id);
    if (!tokens) throw new Error(`No tokens found for ${platform}`);

    const connector = getConnector(platform);
    const response = await connector.healthCheck(tokens.accessToken);
    const drift = await checkSchemaDrift(tenantId, integration.id, response, endpoint);
    await job.updateProgress(100);

    return drift;
  }

  private async handleApiVersionCheck(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    // API version checks are implemented via schema drift detection
    // with a focus on version-related endpoint fields
    const platform = payload.platform as Platform;
    if (!platform) throw new Error('platform required for api_version_check');

    const integration = await getIntegrationByPlatform(tenantId, platform);
    if (!integration) throw new Error(`No integration found for ${platform}`);
    const tokens = await retrieveTokens(integration.id);
    if (!tokens) throw new Error(`No tokens found for ${platform}`);

    const connector = getConnector(platform);
    const health = await connector.healthCheck(tokens.accessToken);
    await job.updateProgress(100);

    return {
      platform,
      healthy: health.healthy,
      latencyMs: health.latencyMs,
      metadata: health.metadata,
    };
  }

  // ────────────────────── Healing ──────────────────────

  private async handleAutoReconnect(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    if (payload.platform) {
      const platform = payload.platform as Platform;
      const integration = await getIntegrationByPlatform(tenantId, platform);
      if (!integration) throw new Error(`No integration found for ${platform}`);
      const result = await attemptReconnection(integration.id, tenantId, platform);
      await job.updateProgress(100);
      return result as unknown as Record<string, unknown>;
    }

    // Full healing cycle for the tenant
    const report = await runHealingCycle(tenantId);
    await job.updateProgress(100);
    return {
      reconnected: report.reconnected,
      stillFailed: report.stillFailed,
      circuitsReset: report.circuitsReset,
      fallbacksAvailable: report.fallbacks.filter((f) => f.available).length,
    };
  }

  // ────────────────────── Connector proxy ──────────────────────

  /**
   * Allowlist of safe public connector methods that can be invoked via the
   * `connector_request` task.  Prototype methods and private helpers are
   * intentionally excluded.
   */
  private static readonly PERMITTED_CONNECTOR_METHODS = new Set<string>([
    'healthCheck',
    'fetchCampaigns',
    'fetchAdGroups',
    'fetchKeywords',
    'fetchConversions',
    'fetchMetrics',
    'fetchAudienceInsights',
    'fetchPlacementInsights',
    'fetchPages',
    'fetchReports',
    'fetchContactLists',
    'fetchDealPipelines',
    'fetchContent',
    'fetchProducts',
    'fetchOrders',
    'fetchEvents',
    'fetchUserProperties',
    'sendMessage',
    'fetchBalance',
  ]);

  private async handleConnectorRequest(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    const platform = payload.platform as Platform;
    const method = payload.method as string;
    const args = (payload.args ?? {}) as Record<string, unknown>;

    if (!platform || !method) throw new Error('platform and method required for connector_request');

    // Strict allowlist — prevents prototype pollution / arbitrary method execution
    if (!CompatibilityWorker.PERMITTED_CONNECTOR_METHODS.has(method)) {
      throw new Error(`Method '${method}' is not an allowed connector operation`);
    }

    if (!hasConnector(platform)) throw new Error(`No connector registered for ${platform}`);

    const integration = await getIntegrationByPlatform(tenantId, platform);
    if (!integration) throw new Error(`No integration found for ${platform}`);

    const tokens = await retrieveTokens(integration.id);
    if (!tokens) throw new Error(`No tokens found for ${platform}`);

    const connector = getConnector(platform) as unknown as Record<string, unknown>;
    const fn = connector[method];
    if (typeof fn !== 'function') throw new Error(`Method ${method} not found on ${platform} connector`);

    await job.updateProgress(20);
    const result = await (fn as Function).call(connector, tokens.accessToken, ...Object.values(args));
    await job.updateProgress(100);

    return { platform, method, result };
  }

  // ────────────────────── Strategy ──────────────────────

  private async handleStrategyGenerate(
    tenantId: string,
    payload: Record<string, unknown>,
    job: Job<TaskPayload>,
  ): Promise<Record<string, unknown>> {
    // Generate an integration strategy based on detected stack + health
    const summary = await getHealthSummary(tenantId);
    await job.updateProgress(50);

    const recommendations: string[] = [];
    for (const integration of summary.integrations ?? []) {
      const int = integration as Record<string, unknown>;
      if ((int.healthScore as number) < 70) {
        recommendations.push(`${int.platform}: Health score low (${int.healthScore}), consider reconnection`);
      }
    }

    await job.updateProgress(100);
    return {
      tenantId,
      overallHealth: summary.overallHealth,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  }
}
