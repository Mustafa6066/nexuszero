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

// ────────────────── Inline tech stack detection (fallback when queue is unavailable) ──────────────────

interface Detection { platform: Platform; confidence: number; evidence: string }

async function fetchHtml(url: string): Promise<string | null> {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  try {
    const res = await fetch(normalized, {
      headers: { 'User-Agent': 'NexusZero-Bot/1.0 (StackDetection)', Accept: 'text/html' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return null;
    return await res.text();
  } catch { return null; }
}

function detectTechStackInline(html: string): Detection[] {
  const d: Detection[] = [];
  const add = (platform: Platform, confidence: number, evidence: string) => {
    if (confidence > 0) d.push({ platform, confidence: Math.min(confidence, 1), evidence });
  };

  // Google Analytics
  let ga = 0;
  if (html.match(/G-[A-Z0-9]{6,}/)) ga += 0.6;
  if (html.includes('googletagmanager.com/gtag/js') || html.includes('gtag(')) ga += 0.3;
  if (html.includes('googletagmanager.com/gtm.js')) ga += 0.2;
  add('google_analytics', ga, 'GA4 measurement ID or gtag.js detected');

  // Google Ads
  let gads = 0;
  if (html.match(/AW-\d{9,}/)) gads += 0.6;
  if (html.includes('googleadservices.com/pagead/conversion')) gads += 0.4;
  if (html.includes('googlesyndication.com')) gads += 0.2;
  add('google_ads', gads, 'Google Ads conversion tag or remarketing pixel');

  // Meta Pixel
  let meta = 0;
  if (html.includes('connect.facebook.net') || html.includes('fbq(')) meta += 0.6;
  if (html.includes('facebook.com/tr?id=')) meta += 0.2;
  add('meta_ads', meta, 'Meta/Facebook pixel script or fbq() calls');

  // LinkedIn Insight
  let li = 0;
  if (html.includes('snap.licdn.com/li.lms-analytics')) li += 0.7;
  if (html.match(/_linkedin_partner_id/)) li += 0.3;
  add('linkedin_ads', li, 'LinkedIn Insight Tag');

  // HubSpot
  let hs = 0;
  if (html.includes('js.hs-scripts.com') || html.includes('js.hsforms.net')) hs += 0.6;
  if (html.includes('hbspt.forms.create')) hs += 0.3;
  add('hubspot', hs, 'HubSpot tracking code or forms');

  // Salesforce
  let sf = 0;
  if (html.includes('pardot.com') || html.includes('pi.pardot.com')) sf += 0.5;
  if (html.includes('webto.salesforce.com')) sf += 0.5;
  add('salesforce', sf, 'Salesforce/Pardot tracking');

  // WordPress
  let wp = 0;
  if (html.includes('/wp-content/') || html.includes('/wp-includes/')) wp += 0.5;
  if (html.toLowerCase().includes('generator" content="wordpress')) wp += 0.4;
  add('wordpress', wp, 'WordPress meta tags or wp-content paths');

  // Webflow
  let wf = 0;
  if (html.toLowerCase().includes('generator" content="webflow')) wf += 0.6;
  if (html.includes('data-wf-site') || html.includes('data-wf-page')) wf += 0.3;
  add('webflow', wf, 'Webflow meta generator or data-wf attributes');

  // Shopify
  let sh = 0;
  if (html.includes('cdn.shopify.com')) sh += 0.5;
  if (html.includes('Shopify.shop') || html.includes('myshopify.com')) sh += 0.3;
  add('shopify', sh, 'Shopify CDN or meta tags');

  // Contentful
  let cf = 0;
  if (html.includes('images.ctfassets.net') || html.includes('assets.ctfassets.net')) cf += 0.5;
  add('contentful', cf, 'Contentful CDN references');

  // Mixpanel
  let mx = 0;
  if (html.includes('cdn.mxpnl.com') || html.includes('mixpanel.init(')) mx += 0.6;
  add('mixpanel', mx, 'Mixpanel SDK');

  // Amplitude
  let amp = 0;
  if (html.includes('cdn.amplitude.com') || html.includes('amplitude.init(')) amp += 0.6;
  add('amplitude', amp, 'Amplitude SDK');

  // Stripe
  let stripe = 0;
  if (html.includes('js.stripe.com')) stripe += 0.7;
  add('stripe_connect', stripe, 'Stripe.js detected');

  // Google Search Console (meta verification tag)
  let gsc = 0;
  if (html.includes('google-site-verification')) gsc += 0.5;
  add('google_search_console', gsc, 'Google site verification meta tag');

  return d;
}

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

  // Try queue-based async flow first; fall back to inline detection
  try {
    const taskId = await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'tech_stack_detection',
      priority: 'high',
      input: { websiteUrl: parsed.data.websiteUrl },
    });
    return c.json({ taskId, status: 'queued' });
  } catch {
    // Queue unavailable — run inline detection
  }

  const html = await fetchHtml(parsed.data.websiteUrl);
  if (!html) {
    return c.json({ detections: [], platforms: [], status: 'completed', message: 'Could not fetch website' });
  }

  const detections = detectTechStackInline(html);
  return c.json({ detections, platforms: detections.map((d) => d.platform), status: 'completed' });
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

  // Try queue-based async flow first; fall back to inline detection if queue is unavailable
  try {
    const taskId = await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'onboarding_flow',
      priority: 'critical',
      input: { step: 'initiate', websiteUrl: parsed.data.websiteUrl },
    });
    return c.json({ taskId, status: 'queued' });
  } catch {
    // Queue unavailable — run inline detection
  }

  const html = await fetchHtml(parsed.data.websiteUrl);
  if (!html) {
    return c.json({ detections: [], platforms: [], status: 'completed', message: 'Could not fetch website' });
  }

  const detections = detectTechStackInline(html);
  const platforms = detections.map((d) => d.platform);

  // Upsert detected integrations into the database as "disconnected" (pending connection)
  if (detections.length > 0) {
    await withTenantDb(tenantId, async (db) => {
      for (const det of detections) {
        const existing = await db
          .select({ id: integrations.id })
          .from(integrations)
          .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, det.platform)))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(integrations).values({
            tenantId,
            platform: det.platform,
            status: 'disconnected',
            accessTokenEncrypted: '',
            detectedVia: 'auto_discovery',
            healthScore: 0,
            config: { detectedConfidence: det.confidence, evidence: det.evidence },
          });
        }
      }
    });
  }

  return c.json({ detections, platforms, status: 'completed' });
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
