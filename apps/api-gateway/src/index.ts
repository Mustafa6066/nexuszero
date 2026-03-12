import { execFileSync } from 'child_process';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { tenantRoutes } from './routes/tenants.js';
import { campaignRoutes } from './routes/campaigns.js';
import { agentRoutes } from './routes/agents.js';
import { creativeRoutes } from './routes/creatives.js';
import { webhookRoutes } from './routes/webhooks.js';
import { analyticsRoutes } from './routes/analytics.js';
import { aeoRoutes } from './routes/aeo.js';
import { integrationRoutes } from './routes/integrations.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { errorHandler } from './middleware/error-handler.js';
import { yogaHandler } from './graphql/index.js';

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Tenant-ID'],
  credentials: true,
}));
app.onError(errorHandler);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() }));

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

app.route('/api/v1', api);

// GraphQL endpoint
app.all('/graphql', async (c) => {
  const response = await yogaHandler.handleRequest(c.req.raw, {});
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

// Run DB migration before starting the server
try {
  execFileSync(process.execPath, ['src/migrate.mjs'], { stdio: 'inherit' });
} catch (e) {
  console.error('Migration failed, aborting startup:', e);
  process.exit(1);
}

const port = parseInt(process.env.PORT || '4000', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`API Gateway running on port ${port}`);
});

export default app;
