import { Hono } from 'hono';
import { withTenantDb, integrations, integrationHealth } from '@nexuszero/db';
import { AppError } from '@nexuszero/shared';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and, desc } from 'drizzle-orm';
import type { Platform } from '@nexuszero/shared';
import {
  detectStackSchema,
  startOnboardingSchema,
  oauthCallbackSchema,
  addIntegrationSchema,
  platformSchema,
} from '@nexuszero/shared';

/** Parse and validate a :platform route param.  Throws a user-friendly 400 on failure. */
function parsePlatform(raw: string): Platform {
  const parsed = platformSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', { field: 'platform', value: raw });
  }
  return parsed.data;
}

const app = new Hono();

// ────────────────── Integrations CRUD ──────────────────

// GET /integrations — list all integrations for tenant
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const result = await db
      .select({
        id: integrations.id,
        platform: integrations.platform,
        status: integrations.status,
        healthScore: integrations.healthScore,
        lastCheckedAt: integrations.updatedAt,
        scopes: integrations.scopesGranted,
        config: integrations.config,
        createdAt: integrations.createdAt,
        updatedAt: integrations.updatedAt,
      })
      .from(integrations)
      .where(eq(integrations.tenantId, tenantId))
      .orderBy(integrations.platform);

    return c.json(result);
  });
});

// GET /integrations/:platform — get integration by platform
app.get('/:platform', async (c) => {
  const tenantId = c.get('tenantId');
  const platform = parsePlatform(c.req.param('platform'));

  return withTenantDb(tenantId, async (db) => {
    const [integration] = await db
      .select({
        id: integrations.id,
        platform: integrations.platform,
        status: integrations.status,
        healthScore: integrations.healthScore,
        lastCheckedAt: integrations.updatedAt,
        scopes: integrations.scopesGranted,
        config: integrations.config,
        rateLimitRemaining: integrations.rateLimitRemaining,
        rateLimitResetAt: integrations.rateLimitResetAt,
        createdAt: integrations.createdAt,
        updatedAt: integrations.updatedAt,
      })
      .from(integrations)
      .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, platform)))
      .limit(1);

    if (!integration) {
      throw new AppError('VALIDATION_ERROR', { platform, reason: 'Integration not found' });
    }

    return c.json(integration);
  });
});

// DELETE /integrations/:platform — disconnect integration
app.delete('/:platform', async (c) => {
  const tenantId = c.get('tenantId');
  const platform = parsePlatform(c.req.param('platform'));

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db
      .update(integrations)
      .set({ status: 'disconnected', updatedAt: new Date() })
      .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, platform)))
      .returning({ id: integrations.id });

    if (!updated) {
      throw new AppError('VALIDATION_ERROR', { platform, reason: 'Integration not found' });
    }

    return c.json({ disconnected: true, platform });
  });
});

// ────────────────── Health ──────────────────

// GET /integrations/health/summary — overall health summary
app.get('/health/summary', async (c) => {
  const tenantId = c.get('tenantId');

  // Dispatch to compatibility agent to compute summary
  const taskId = await publishAgentTask({
    tenantId,
    agentType: 'compatibility',
    type: 'health_check',
    priority: 'high',
  });

  return c.json({ taskId, status: 'queued' });
});

// GET /integrations/:platform/health — health history for a platform
app.get('/:platform/health', async (c) => {
  const tenantId = c.get('tenantId');
  const platform = parsePlatform(c.req.param('platform'));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));

  return withTenantDb(tenantId, async (db) => {
    const [integration] = await db
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, platform)))
      .limit(1);

    if (!integration) {
      throw new AppError('VALIDATION_ERROR', { platform, reason: 'Integration not found' });
    }

    const logs = await db
      .select()
      .from(integrationHealth)
      .where(eq(integrationHealth.integrationId, integration.id))
      .orderBy(desc(integrationHealth.checkedAt))
      .limit(limit);

    return c.json(logs);
  });
});

// ────────────────── OAuth Connect (via task queue) ──────────────────

// POST /integrations/connect — initiate OAuth connection
app.post('/connect', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = addIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues);
  }

  const taskId = await publishAgentTask({
    tenantId,
    agentType: 'compatibility',
    type: 'oauth_connect',
    priority: 'high',
    input: { platform: parsed.data.platform, config: parsed.data.config },
  });

  return c.json({ taskId, status: 'queued', platform: parsed.data.platform });
});

// POST /integrations/reconnect/:platform — trigger auto-reconnect
app.post('/reconnect/:platform', async (c) => {
  const tenantId = c.get('tenantId');
  const platform = parsePlatform(c.req.param('platform'));

  const taskId = await publishAgentTask({
    tenantId,
    agentType: 'compatibility',
    type: 'auto_reconnect',
    priority: 'high',
    input: { platform },
  });

  return c.json({ taskId, status: 'queued', platform });
});

// ────────────────── Tech Stack Detection ──────────────────

// POST /integrations/detect — detect tech stack from URL
app.post('/detect', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = detectStackSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues);
  }

  const taskId = await publishAgentTask({
    tenantId,
    agentType: 'compatibility',
    type: 'tech_stack_detection',
    priority: 'high',
    input: { websiteUrl: parsed.data.websiteUrl },
  });

  return c.json({ taskId, status: 'queued' });
});

// ────────────────── Onboarding ──────────────────

// POST /integrations/onboarding/start — initiate full onboarding flow
app.post('/onboarding/start', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = startOnboardingSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues);
  }

  const taskId = await publishAgentTask({
    tenantId,
    agentType: 'compatibility',
    type: 'onboarding_flow',
    priority: 'critical',
    input: { step: 'initiate', websiteUrl: parsed.data.websiteUrl },
  });

  return c.json({ taskId, status: 'queued' });
});

// POST /integrations/onboarding/callback — OAuth callback during onboarding
app.post('/onboarding/callback', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = oauthCallbackSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues);
  }

  const taskId = await publishAgentTask({
    tenantId,
    agentType: 'compatibility',
    type: 'onboarding_flow',
    priority: 'critical',
    input: { step: 'oauth_callback', platform: parsed.data.platform, code: parsed.data.code },
  });

  return c.json({ taskId, status: 'queued' });
});

// POST /integrations/onboarding/complete — finalize onboarding
app.post('/onboarding/complete', async (c) => {
  const tenantId = c.get('tenantId');

  const taskId = await publishAgentTask({
    tenantId,
    agentType: 'compatibility',
    type: 'onboarding_flow',
    priority: 'critical',
    input: { step: 'complete' },
  });

  return c.json({ taskId, status: 'queued' });
});

export const integrationRoutes = app;
