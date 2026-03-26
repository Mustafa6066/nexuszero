import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import cron from 'node-cron';
import { getDb, tenants, agents, integrations } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { initializeOpenTelemetry } from '@nexuszero/shared';

import { CompatibilityWorker } from './agent.js';
import { env } from './config/env.js';
import { httpsRedirectMiddleware } from './middleware/https-redirect.js';

// Cron-driven background tasks
import { refreshExpiringTokens } from './oauth/token-refresher.js';
import { runHealthSweep } from './health/health-monitor.js';
import { refreshSchemaSnapshots } from './schema/schema-tracker.js';
import { runGlobalHealingSweep } from './healing/healing-orchestrator.js';

// API-driven handlers
import { detectTechStack } from './discovery/stack-detector.js';
import { generateAuthUrl, completeOAuthFlow } from './oauth/oauth-manager.js';
import { processReauthCallback } from './oauth/reauth-flow.js';
import { getHealthSummary, getHealthLogs } from './health/health-reporter.js';
import { getAllCircuitStatuses } from './healing/circuit-state-manager.js';
import { getRedisConnection } from '@nexuszero/queue';

// Universal onboarding handlers
import { runUniversalOnboarding, previewPlatform } from './onboarding/universal-onboarding.js';
import { analyzePlatform } from './intelligence/platform-analyzer.js';
import { getBlueprint, searchBlueprints, listBlueprints } from './intelligence/platform-knowledge.js';

import {
  // Connector registration
  registerConnector,
} from './connectors/connector-registry.js';

// Register all connectors on startup
import { GoogleAnalyticsConnector } from './connectors/analytics/google-analytics.connector.js';
import { MixpanelConnector } from './connectors/analytics/mixpanel.connector.js';
import { AmplitudeConnector } from './connectors/analytics/amplitude.connector.js';
import { GoogleAdsConnector } from './connectors/ads/google-ads.connector.js';
import { MetaAdsConnector } from './connectors/ads/meta-ads.connector.js';
import { LinkedInAdsConnector } from './connectors/ads/linkedin-ads.connector.js';
import { GoogleSearchConsoleConnector } from './connectors/seo/google-search-console.connector.js';
import { HubSpotConnector } from './connectors/crm/hubspot.connector.js';
import { SalesforceConnector } from './connectors/crm/salesforce.connector.js';
import { WordPressConnector } from './connectors/cms/wordpress.connector.js';
import { WebflowConnector } from './connectors/cms/webflow.connector.js';
import { ContentfulConnector } from './connectors/cms/contentful.connector.js';
import { ShopifyConnector } from './connectors/cms/shopify.connector.js';
import { SlackConnector } from './connectors/messaging/slack.connector.js';
import { SendGridConnector } from './connectors/messaging/sendgrid.connector.js';
import { StripeConnector } from './connectors/payments/stripe.connector.js';
import type { Platform } from '@nexuszero/shared';

export function bootstrapConnectors(): void {
  registerConnector('google_analytics', new GoogleAnalyticsConnector());
  registerConnector('mixpanel', new MixpanelConnector());
  registerConnector('amplitude', new AmplitudeConnector());
  registerConnector('google_ads', new GoogleAdsConnector());
  registerConnector('meta_ads', new MetaAdsConnector());
  registerConnector('linkedin_ads', new LinkedInAdsConnector());
  registerConnector('google_search_console', new GoogleSearchConsoleConnector());
  registerConnector('hubspot', new HubSpotConnector());
  registerConnector('salesforce', new SalesforceConnector());
  registerConnector('wordpress', new WordPressConnector());
  registerConnector('webflow', new WebflowConnector());
  registerConnector('contentful', new ContentfulConnector());
  registerConnector('shopify', new ShopifyConnector());
  registerConnector('slack', new SlackConnector());
  registerConnector('sendgrid', new SendGridConnector());
  registerConnector('stripe_connect', new StripeConnector());
}

// ────────────────── HTTP API ──────────────────

/** Timing-safe comparison for the internal API key. */
export function isValidInternalKey(provided: string): boolean {
  try {
    const expected = Buffer.from(env.internalApiKey, 'utf8');
    const actual = Buffer.from(provided, 'utf8');
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createApp(): Hono {
  const app = new Hono();

  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use('*', httpsRedirectMiddleware);

  // Public health check — no auth required (used by load balancers / Railway)
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'compatibility-agent',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }),
  );

  // ── Internal auth middleware for all other routes ──────────────────────────
  // Callers must supply the shared secret in `X-Internal-Key`.
  app.use('*', async (c, next) => {
    const provided = c.req.header('X-Internal-Key') ?? '';
    if (!provided || !isValidInternalKey(provided)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  });

  // Tech-stack detection
  app.post('/detect', async (c) => {
    const body = await c.req.json<{ websiteUrl: string }>();
    if (!body.websiteUrl) return c.json({ error: 'websiteUrl required' }, 400);
    const result = await detectTechStack(body.websiteUrl);
    return c.json(result);
  });

  // OAuth flow: generate auth URL
  app.get('/oauth/:platform/authorize', async (c) => {
    const platform = c.req.param('platform');
    const tenantId = c.req.query('tenantId');
    if (!tenantId) return c.json({ error: 'tenantId required' }, 400);
    const authUrl = await generateAuthUrl(platform as Platform, tenantId);
    return c.json({ authUrl });
  });

  // OAuth callback — handles BOTH initial OAuth connects and reauth flows.
  // Verifies state against Redis (one-time-use) before trusting tenantId/platform.
  app.get('/oauth/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !state) return c.json({ error: 'code and state required' }, 400);

    const redis = getRedisConnection();
    const stateJson = await redis.get(`oauth:state:${state}`);
    if (!stateJson) {
      return c.json({ error: 'Invalid or expired OAuth state' }, 400);
    }

    // State is single-use — delete it immediately after retrieval
    await redis.del(`oauth:state:${state}`);

    let stateData: {
      tenantId: string;
      platform: Platform;
      type?: string;
      integrationId?: string;
    };
    try {
      stateData = JSON.parse(stateJson);
    } catch {
      return c.json({ error: 'Malformed state data' }, 400);
    }

    // Route to the appropriate handler based on the OAuth flow type
    if (stateData.type === 'reauth') {
      // State already deleted above; pass the original state key for logging context
      const result = await processReauthCallback(state, code);
      return c.json(result);
    }

    const result = await completeOAuthFlow(
      stateData.tenantId,
      stateData.platform,
      code,
      'manual_connect',
    );
    return c.json(result);
  });

  // Health summary for a tenant
  app.get('/health/:tenantId', async (c) => {
    const tenantId = c.req.param('tenantId');
    const summary = await getHealthSummary(tenantId);
    return c.json(summary);
  });

  // Health logs
  app.get('/health/:tenantId/logs', async (c) => {
    const tenantId = c.req.param('tenantId');
    const platform = c.req.query('platform') as Platform | undefined;
    const rawLimit = parseInt(c.req.query('limit') ?? '50', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const logs = platform ? await getHealthLogs(tenantId, platform, limit) : [];
    return c.json(logs);
  });

  // Circuit breaker statuses
  app.get('/circuits', (c) => {
    const statuses = getAllCircuitStatuses();
    return c.json(statuses);
  });

  // ── Universal Onboarding Routes (AI-powered) ────────────────────────────

  // Analyze any platform — returns a PlatformBlueprint
  app.post('/platform/analyze', async (c) => {
    const body = await c.req.json<{ platformName: string; platformUrl?: string; docsUrl?: string; context?: string }>();
    if (!body.platformName) return c.json({ error: 'platformName required' }, 400);
    const blueprint = await analyzePlatform(body);
    return c.json(blueprint);
  });

  // Preview a platform — analyze + generate connection strategy without connecting
  app.post('/platform/preview', async (c) => {
    const body = await c.req.json<{ platformName: string; platformUrl?: string; docsUrl?: string; context?: string }>();
    if (!body.platformName) return c.json({ error: 'platformName required' }, 400);
    const preview = await previewPlatform(body);
    return c.json(preview);
  });

  // Universal onboard — connect ANY platform(s) for a tenant
  app.post('/onboard/universal', async (c) => {
    const body = await c.req.json<{
      tenantId: string;
      websiteUrl?: string;
      platforms: Array<{ platformName: string; platformUrl?: string; docsUrl?: string; credentials: Record<string, string>; context?: string }>;
    }>();
    if (!body.tenantId) return c.json({ error: 'tenantId required' }, 400);
    if (!body.platforms || body.platforms.length === 0) return c.json({ error: 'At least one platform required' }, 400);
    const result = await runUniversalOnboarding(body);
    return c.json(result);
  });

  // Get a stored blueprint
  app.get('/platform/blueprint/:platformId', async (c) => {
    const platformId = c.req.param('platformId');
    const blueprint = await getBlueprint(platformId);
    if (!blueprint) return c.json({ error: 'Blueprint not found' }, 404);
    return c.json(blueprint);
  });

  // Search platform knowledge base
  app.get('/platform/search', async (c) => {
    const query = c.req.query('q');
    if (query) {
      const results = await searchBlueprints(query);
      return c.json({ query, results });
    }
    const all = await listBlueprints();
    return c.json({ results: all });
  });

  return app;
}

// ────────────────── Cron Jobs ──────────────────

export function startCronJobs(): void {
  // Token refresh: every minute — runs globally (all tenants) in a single sweep
  cron.schedule('* * * * *', async () => {
    try {
      await refreshExpiringTokens();
    } catch (err) {
      console.error('[cron] Token refresh sweep failed:', err);
    }
  });

  // Health sweep: every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runHealthSweep().catch((err) => console.error('[cron] Health sweep failed:', err));
    } catch (err) {
      console.error('[cron] Health sweep failed:', err);
    }
  });

  // Schema drift check: every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const db = getDb();
      const activeIntegrations = await db
        .select({ tenantId: integrations.tenantId, id: integrations.id, platform: integrations.platform })
        .from(integrations)
        .where(eq(integrations.status, 'connected'));
      for (const integration of activeIntegrations) {
        await refreshSchemaSnapshots(integration.tenantId, integration.id, integration.platform as Platform).catch((err) =>
          console.error(`[cron] Schema refresh failed for ${integration.tenantId}/${integration.platform}:`, err),
        );
      }
    } catch (err) {
      console.error('[cron] Schema drift check failed:', err);
    }
  });

  // Healing sweep: every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      await runGlobalHealingSweep();
    } catch (err) {
      console.error('[cron] Global healing sweep failed:', err);
    }
  });

  console.log('[cron] Scheduled: token-refresh(1m), health(15m), schema(1h), healing(30m)');
}

// ────────────────── Main ──────────────────

export async function main(): Promise<void> {
  await initializeOpenTelemetry({ serviceName: 'compatibility-agent' });
  // 1. Register all connectors
  bootstrapConnectors();
  console.log('[boot] Connectors registered');

  // 2. Start the BullMQ worker
  const worker = new CompatibilityWorker();
  const db = getDb();

  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  // Ensure compatibility agent records exist for each tenant
  for (const tenant of activeTenants) {
    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.tenantId, tenant.id), eq(agents.type, 'compatibility')))
      .limit(1);

    if (!existing) {
      await db.insert(agents).values({
        tenantId: tenant.id,
        type: 'compatibility',
        status: 'idle',
        metadata: {},
      });
    }
  }

  await worker.start(activeTenants.map((t) => t.id));
  console.log(`[boot] Worker started for ${activeTenants.length} tenants`);

  // 3. Start cron jobs
  startCronJobs();

  // 4. Start HTTP server
  const app = createApp();
  const port = env.port;

  serve({ fetch: app.fetch, port }, () => {
    console.log(`[boot] Compatibility Agent running on port ${port}`);
  });
}

const isMainModule = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMainModule) {
  main().catch((err) => {
    console.error('Compatibility Agent failed to start:', err);
    process.exit(1);
  });
}
