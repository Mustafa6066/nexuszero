import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { initializeOpenTelemetry } from '@nexuszero/shared';
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
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { errorHandler } from './middleware/error-handler.js';
import { tracingMiddleware } from './middleware/tracing.js';
import { yogaHandler } from './graphql/index.js';

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

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() }));

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

async function start() {
  await initializeOpenTelemetry({ serviceName: 'api-gateway' });

  serve({ fetch: app.fetch, port }, () => {
    console.log(`API Gateway running on port ${port}`);
  });
}

start().catch((error) => {
  console.error('API Gateway failed to start:', error);
  process.exit(1);
});

export default app;
