import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { OnboardingWorker } from './worker.js';
import { OnboardingStateMachine } from './state-machine.js';
import { getDb, tenants } from '@nexuszero/db';
import { initializeOpenTelemetry } from '@nexuszero/shared';
import { eq } from 'drizzle-orm';

const app = new Hono();
const worker = new OnboardingWorker();

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'onboarding-service' }));

// Get onboarding status
app.get('/status/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const db = getDb();

  const [tenant] = await db.select({
    onboardingState: tenants.onboardingState,
    status: tenants.status,
    plan: tenants.plan,
  }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  const sm = new OnboardingStateMachine(tenantId);
  const progress = sm.getProgress(tenant.onboardingState as any);

  return c.json({
    tenantId,
    currentState: tenant.onboardingState,
    tenantStatus: tenant.status,
    progress,
  });
});

// Manually trigger a specific step (admin/internal use)
app.post('/trigger/:tenantId/:step', async (c) => {
  const tenantId = c.req.param('tenantId');
  const step = c.req.param('step');
  const config = await c.req.json().catch(() => ({}));

  const sm = new OnboardingStateMachine(tenantId);
  await sm.triggerStep(step as any, config);

  return c.json({ tenantId, step, status: 'triggered' }, 202);
});

// Start onboarding for a new tenant
app.post('/start/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const config = await c.req.json().catch(() => ({}));

  const sm = new OnboardingStateMachine(tenantId);
  await sm.startOnboarding(config);

  return c.json({ tenantId, status: 'onboarding_started' }, 202);
});

async function start() {
  await initializeOpenTelemetry({ serviceName: 'onboarding-service' });
  worker.start();

  const port = parseInt(process.env.ONBOARDING_SERVICE_PORT || '4004', 10);
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Onboarding service running on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Onboarding service failed to start:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('Onboarding service shutting down...');
  await worker.stop();
  process.exit(0);
});
