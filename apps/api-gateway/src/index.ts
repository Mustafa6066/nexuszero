import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { initializeOpenTelemetry } from '@nexuszero/shared';
import { getDb } from '@nexuszero/db';
import { sql } from 'drizzle-orm';
import { attachWebSocketServer, closeWebSocketServer } from './services/websocket.js';
import { initWsBridge, closeWsBridge } from './services/ws-bridge.js';
import { verifyJwt } from './middleware/auth.js';
import { tenantRoutes } from './routes/tenants.js';
import { campaignRoutes } from './routes/campaigns.js';
import { agentRoutes } from './routes/agents.js';
import { creativeRoutes } from './routes/creatives.js';
import { webhookRoutes } from './routes/webhooks.js';
import { analyticsRoutes } from './routes/analytics.js';
import { aeoRoutes } from './routes/aeo.js';
import { integrationRoutes } from './routes/integrations.js';
import { assistantRoutes } from './routes/assistant.js';
import { scannerRoutes } from './routes/scanner.js';
import { engineRoutes } from './routes/engines.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { approvalRoutes } from './routes/approvals.js';
import { alertRoutes } from './routes/alerts.js';
import { streakRoutes } from './routes/streaks.js';
import { compoundInsightsRoutes } from './routes/compound-insights.js';
import { cmsRoutes } from './routes/cms.js';
import { redditRoutes } from './routes/reddit.js';
import { socialRoutes } from './routes/social.js';
import { contentRoutes } from './routes/content.js';
import { geoRoutes } from './routes/geo.js';
import { modelRoutes } from './routes/models.js';
import { uploadRoutes } from './routes/uploads.js';
import llmUsageRoutes from './routes/llm-usage.js';
import slaRoutes from './routes/sla.js';
import wsStatsRoutes from './routes/ws-stats.js';
import agentMemoryRoutes from './routes/agent-memory.js';
import planApprovalRoutes from './routes/plan-approval.js';
import pluginRoutes from './routes/plugins.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { errorHandler } from './middleware/error-handler.js';
import { tracingMiddleware } from './middleware/tracing.js';
import { yogaHandler } from './graphql/index.js';
import { billingRoutes } from './routes/billing.js';

const app = new Hono();

// Global middleware
app.use('*', tracingMiddleware);
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:3000',
    'https://nexuszero-dashboard.vercel.app',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Tenant-ID'],
  credentials: true,
}));
app.onError(errorHandler);

// Request body size limit — 2 MB default, configurable via env
const maxBodySize = parseInt(process.env.MAX_BODY_SIZE_BYTES || String(2 * 1024 * 1024), 10);
app.use('*', bodyLimit({ maxSize: maxBodySize, onError: (c) => c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: `Request body exceeds ${Math.round(maxBodySize / 1024 / 1024)}MB limit` } }, 413) }));

// Deep health check — verifies DB connectivity
app.get('/health', async (c) => {
  const checks: Record<string, 'ok' | 'error'> = {};
  let healthy = true;

  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
    healthy = false;
  }

  const status = healthy ? 'ok' : 'degraded';
  return c.json({ status, service: 'api-gateway', timestamp: new Date().toISOString(), checks }, healthy ? 200 : 503);
});

// Global health check aggregator
app.get('/health/all', async (c) => {
  const services = [
    { name: 'orchestrator', url: process.env.ORCHESTRATOR_URL || 'http://localhost:4001' },
    { name: 'webhook-service', url: process.env.WEBHOOK_SERVICE_URL || 'http://localhost:4003' },
    { name: 'onboarding-service', url: process.env.ONBOARDING_SERVICE_URL || 'http://localhost:4004' },
  ];

  const results = await Promise.all(
    services.map(async (s) => {
      try {
        const res = await fetch(`${s.url}/health`, { signal: AbortSignal.timeout(2000) });
        return { name: s.name, status: res.ok ? 'ok' : 'error', statusCode: res.status };
      } catch (e) {
        return { name: s.name, status: 'unreachable', error: (e as Error).message };
      }
    })
  );

  const allOk = results.every((r) => r.status === 'ok');
  return c.json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: results,
  }, allOk ? 200 : 503);
});

// Public routes
app.route('/api/v1/auth', tenantRoutes);
app.route('/api/v1/billing', billingRoutes);

// Token refresh endpoint (requires valid JWT)
app.post('/api/v1/auth/refresh', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: { code: 'AUTH_REQUIRED', message: 'Bearer token required' } }, 401);
  }
  try {
    const { verifyJwt, signJwt } = await import('./middleware/auth.js');
    const payload = verifyJwt(authHeader.substring(7));
    const newToken = signJwt({ userId: payload.userId, tenantId: payload.tenantId, email: payload.email, role: payload.role });
    return c.json({ token: newToken });
  } catch {
    return c.json({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Token expired or invalid' } }, 401);
  }
});

// Protected routes
const api = new Hono();
api.use('*', authMiddleware);
api.use('*', tenantMiddleware);
api.use('*', rateLimitMiddleware);

api.route('/tenants', tenantRoutes);
api.route('/campaigns', campaignRoutes);
api.route('/agents', agentRoutes);
api.route('/creatives', creativeRoutes);
api.route('/webhooks', webhookRoutes);
api.route('/analytics', analyticsRoutes);
api.route('/aeo', aeoRoutes);
api.route('/integrations', integrationRoutes);
api.route('/assistant', assistantRoutes);
api.route('/scanner', scannerRoutes);
api.route('/engines', engineRoutes);
api.route('/intelligence', intelligenceRoutes);
api.route('/approvals', approvalRoutes);
api.route('/alerts', alertRoutes);
api.route('/streaks', streakRoutes);
api.route('/insights', compoundInsightsRoutes);
api.route('/cms', cmsRoutes);
api.route('/reddit', redditRoutes);
api.route('/social', socialRoutes);
api.route('/content', contentRoutes);
api.route('/geo', geoRoutes);
api.route('/models', modelRoutes);
api.route('/uploads', uploadRoutes);
api.route('/llm-usage', llmUsageRoutes);
api.route('/sla', slaRoutes);
api.route('/ws', wsStatsRoutes);
api.route('/agent-memory', agentMemoryRoutes);
api.route('/plan-approvals', planApprovalRoutes);
api.route('/plugins', pluginRoutes);

app.route('/api/v1', api);

// GraphQL endpoint
app.all('/graphql', async (c) => {
  const response = await yogaHandler.handleRequest(c.req.raw, {});
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

const port = parseInt(process.env.PORT || '4000', 10);

let server: ReturnType<typeof serve> | null = null;

async function start() {
  await initializeOpenTelemetry({ serviceName: 'api-gateway' });

  server = serve({ fetch: app.fetch, port }, () => {
    console.log(`API Gateway running on port ${port}`);
  });

  // Attach WebSocket server to the HTTP server
  attachWebSocketServer(server, (token) => {
    const user = verifyJwt(token);
    return { ...user, tenantId: user.tenantId, userId: user.userId };
  });

  // Redis pub/sub bridge for multi-instance WS broadcasting
  initWsBridge();

  console.log('WebSocket server attached on /ws');
}

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });
  }

  // Allow in-flight requests to drain (up to 15 seconds)
  const drainTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '15000', 10);
  await new Promise((resolve) => setTimeout(resolve, drainTimeout));

  // Close WebSocket connections and Redis bridge
  await closeWebSocketServer();
  await closeWsBridge();

  try {
    const { closeDb } = await import('@nexuszero/db');
    await closeDb();
    console.log('Database connections closed');
  } catch { /* ignore if already closed */ }

  process.exit(0);
}

start().catch((error) => {
  console.error('API Gateway failed to start:', error);
  process.exit(1);
});

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export default app;
