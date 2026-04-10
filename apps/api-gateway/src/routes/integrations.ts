import { Hono } from 'hono';
import { withTenantDb, integrations, integrationHealth, agents } from '@nexuszero/db';
import { AppError } from '@nexuszero/shared';
import { publishAgentTask, getRedisConnection } from '@nexuszero/queue';
import { eq, and, desc } from 'drizzle-orm';
import { randomBytes, createHash } from 'node:crypto';
import type { Platform } from '@nexuszero/shared';
import {
  detectStackSchema,
  startOnboardingSchema,
  oauthCallbackSchema,
  addIntegrationSchema,
  platformSchema,
  PLATFORM_REGISTRY,
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
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null;
    return await res.text();
  } catch { return null; }
}

function detectTechStackInline(html: string): Detection[] {
  const d: Detection[] = [];
  const add = (platform: Platform, confidence: number, evidence: string) => {
    if (confidence > 0) d.push({ platform, confidence: Math.min(confidence, 1), evidence });
  };

  // Google Analytics / GTM
  let ga = 0;
  if (html.match(/G-[A-Z0-9]{7,10}/)) ga += 0.6;
  if (html.includes('googletagmanager.com/gtag/js') || html.includes('gtag(')) ga += 0.3;
  if (html.includes('googletagmanager.com/gtm.js') || html.match(/GTM-[A-Z0-9]{5,}/)) ga += 0.3;
  if (html.includes('google-analytics.com/analytics.js') || html.includes('ga.js')) ga += 0.3;
  add('google_analytics', ga, 'GA4 measurement ID, GTM container, or gtag.js detected');

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

  // ── SPA / Framework detection (helps identify dynamic-loading sites) ──

  // Next.js / Vercel
  if (html.includes('__next') || html.includes('_next/static') || html.includes('__NEXT_DATA__')) {
    d.push({ platform: 'google_analytics' as Platform, confidence: 0, evidence: 'Next.js app detected — scripts may load dynamically via <Script> component' });
  }

  // Vercel Analytics
  if (html.includes('vercel-analytics') || html.includes('va.vercel-scripts.com') || html.includes('vitals.vercel-insights.com')) {
    add('google_analytics', 0.4, 'Vercel Analytics/Speed Insights detected');
  }

  // Nuxt.js
  if (html.includes('__nuxt') || html.includes('_nuxt/')) {
    d.push({ platform: 'google_analytics' as Platform, confidence: 0, evidence: 'Nuxt.js app detected — scripts may load dynamically' });
  }

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

// ────────────────── OAuth / Connection ──────────────────

/** Get OAuth client credentials from env for a platform */
function getOAuthClientId(platform: Platform): { clientId: string; clientSecret: string } | null {
  const map: Partial<Record<Platform, { id: string; secret: string }>> = {
    google_analytics: { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET' },
    google_ads: { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET' },
    google_search_console: { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET' },
    meta_ads: { id: 'META_APP_ID', secret: 'META_APP_SECRET' },
    linkedin_ads: { id: 'LINKEDIN_CLIENT_ID', secret: 'LINKEDIN_CLIENT_SECRET' },
    hubspot: { id: 'HUBSPOT_CLIENT_ID', secret: 'HUBSPOT_CLIENT_SECRET' },
    salesforce: { id: 'SALESFORCE_CLIENT_ID', secret: 'SALESFORCE_CLIENT_SECRET' },
    slack: { id: 'SLACK_CLIENT_ID', secret: 'SLACK_CLIENT_SECRET' },
    stripe_connect: { id: 'STRIPE_CLIENT_ID', secret: 'STRIPE_SECRET_KEY' },
    shopify: { id: 'SHOPIFY_API_KEY', secret: 'SHOPIFY_API_SECRET' },
  };
  const entry = map[platform];
  if (!entry) return null;
  const clientId = process.env[entry.id] ?? '';
  const clientSecret = process.env[entry.secret] ?? '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// POST /integrations/connect — initiate connection (OAuth redirect or API key instructions)
app.post('/connect', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = addIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues);
  }

  const platform = parsed.data.platform;
  const def = PLATFORM_REGISTRY[platform];
  if (!def) {
    return c.json({ error: `Unknown platform: ${platform}` }, 400);
  }

  // For API key / app_password platforms — return instructions
  if (def.authType === 'api_key' || def.authType === 'app_password') {
    return c.json({
      platform,
      authType: def.authType,
      status: 'needs_credentials',
      label: def.label,
      message: `${def.label} uses an API key. Enter your credentials to connect.`,
    });
  }

  // For OAuth platforms — generate the authorization URL
  const creds = getOAuthClientId(platform);
  if (!creds) {
    return c.json({
      platform,
      authType: def.authType,
      status: 'not_configured',
      label: def.label,
      message: `OAuth credentials for ${def.label} are not configured. Set the environment variables to enable this connection.`,
    });
  }

  const state = randomBytes(32).toString('hex');
  const callbackUrl = process.env.OAUTH_CALLBACK_URL ?? `${c.req.url.split('/api/')[0]}/api/v1/integrations/oauth/callback`;
  const scopes = def.oauth?.defaultScopes ?? [];

  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `${def.oauth!.authorizationUrl}?${params.toString()}`;

  // Store state in Redis for validation in callback (expires in 10 min)
  try {
    const redis = getRedisConnection();
    await redis.set(
      `oauth:state:${state}`,
      JSON.stringify({ tenantId, platform, callbackUrl, createdAt: Date.now() }),
      'EX',
      600,
    );
  } catch {
    // Redis unavailable — state stored only in the URL, callback will still work
  }

  return c.json({
    platform,
    authType: def.authType,
    status: 'redirect',
    authUrl,
    label: def.label,
  });
});

// POST /integrations/connect/api-key — connect a platform using an API key
app.post('/connect/api-key', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json<{ platform: string; apiKey: string; label?: string }>();
  if (!body.platform || !body.apiKey) {
    return c.json({ error: 'platform and apiKey are required' }, 400);
  }

  const platform = parsePlatform(body.platform);
  const def = PLATFORM_REGISTRY[platform];
  if (!def) {
    return c.json({ error: `Unknown platform: ${platform}` }, 400);
  }

  // Queue credential validation + integration creation via compatibility agent
  const taskId = await publishAgentTask({
    tenantId,
    agentType: 'compatibility',
    type: 'oauth_connect',
    priority: 'high',
    input: { platform, code: body.apiKey, isApiKey: true },
  });

  // Also upsert a "connecting" integration record for immediate UI feedback
  await withTenantDb(tenantId, async (db) => {
    const [existing] = await db
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, platform)))
      .limit(1);

    if (existing) {
      await db.update(integrations)
        .set({ status: 'connected', accessTokenEncrypted: 'pending-validation', updatedAt: new Date() })
        .where(eq(integrations.id, existing.id));
    } else {
      await db.insert(integrations).values({
        tenantId,
        platform,
        status: 'connected',
        accessTokenEncrypted: 'pending-validation',
        detectedVia: 'manual_connect',
        healthScore: 0,
        config: {},
      });
    }
  });

  return c.json({ platform, status: 'connecting', taskId, label: def.label });
});

// GET /integrations/oauth/callback — handle OAuth redirect from provider
app.get('/oauth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const dashboardUrl = process.env.DASHBOARD_URL ?? process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3000';

  if (error) {
    return c.redirect(`${dashboardUrl}/dashboard/integrations?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect(`${dashboardUrl}/dashboard/integrations?error=missing_code_or_state`);
  }

  // Retrieve state from Redis
  let tenantId: string | undefined;
  let platform: Platform | undefined;
  let callbackUrl: string | undefined;
  try {
    const redis = getRedisConnection();
    const raw = await redis.get(`oauth:state:${state}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      tenantId = parsed.tenantId;
      platform = parsed.platform as Platform;
      callbackUrl = parsed.callbackUrl;
      await redis.del(`oauth:state:${state}`);
    }
  } catch {
    // Fall through — we'll check query params
  }

  if (!tenantId || !platform) {
    return c.redirect(`${dashboardUrl}/dashboard/integrations?error=invalid_state`);
  }

  // Exchange code for tokens via the compatibility agent
  try {
    await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'oauth_connect',
      priority: 'critical',
      input: { platform, code },
    });
  } catch {
    // Queue failure — log but don't break the redirect
  }

  return c.redirect(`${dashboardUrl}/dashboard/integrations?connected=${platform}`);
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

// ────────────────── Agent Activation ──────────────────

// POST /integrations/activate-agents — activate SEO, AEO, or other agents directly
app.post('/activate-agents', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json<{ agentTypes: string[] }>();

  if (!body.agentTypes || body.agentTypes.length === 0) {
    return c.json({ error: 'agentTypes array required' }, 400);
  }

  const validTypes = ['seo', 'ad', 'data-nexus', 'creative', 'aeo', 'compatibility'] as const;
  const activated: string[] = [];

  await withTenantDb(tenantId, async (db) => {
    for (const type of body.agentTypes) {
      if (!validTypes.includes(type as any)) continue;

      const [existing] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.tenantId, tenantId), eq(agents.type, type as any)))
        .limit(1);

      if (existing) {
        await db.update(agents)
          .set({ status: 'idle', updatedAt: new Date() })
          .where(eq(agents.id, existing.id));
      } else {
        await db.insert(agents).values({
          tenantId,
          type: type as any,
          status: 'idle',
        });
      }
      activated.push(type);
    }
  });

  // Dispatch initial tasks for activated agents
  for (const type of activated) {
    try {
      if (type === 'seo') {
        await publishAgentTask({ tenantId, agentType: 'seo', type: 'keyword_research', priority: 'high', input: {} });
      } else if (type === 'aeo') {
        await publishAgentTask({ tenantId, agentType: 'aeo', type: 'scan_citations', priority: 'high', input: {} });
      }
    } catch {
      // Queue unavailable — agents still activated in DB
    }
  }

  return c.json({ activated, message: `Activated ${activated.length} agent(s): ${activated.join(', ')}` });
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

  // Always run inline detection first for immediate feedback
  const html = await fetchHtml(parsed.data.websiteUrl);
  if (!html) {
    return c.json({ detections: [], platforms: [], status: 'completed', message: 'Could not fetch website' });
  }

  const detections = detectTechStackInline(html);

  const isSpa = html.includes('__next') || html.includes('__NEXT_DATA__') || html.includes('_next/static') ||
    html.includes('__nuxt') || html.includes('_nuxt/') ||
    html.includes('ng-version') || html.includes('__SVELTE__') || html.includes('data-reactroot') ||
    html.includes('id="app"') || html.includes('id="root"');

  const detectedFramework = html.includes('__next') || html.includes('__NEXT_DATA__') ? 'Next.js'
    : html.includes('__nuxt') ? 'Nuxt.js'
    : html.includes('ng-version') ? 'Angular'
    : html.includes('__SVELTE__') ? 'SvelteKit'
    : null;

  // Optionally queue a deeper background analysis
  try {
    await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'tech_stack_detection',
      priority: 'high',
      input: { websiteUrl: parsed.data.websiteUrl },
    });
  } catch {
    // Queue unavailable — inline results are sufficient
  }

  return c.json({
    detections,
    platforms: detections.map((d) => d.platform),
    status: 'completed',
    isSpa,
    detectedFramework,
    ...(detections.length === 0
      ? {
          message: isSpa
            ? `${detectedFramework ?? 'SPA'} detected — tracking scripts are loaded dynamically. Connect platforms manually or use the deep scanner.`
            : 'No tracking tags detected. Connect platforms manually or use the deep scanner.',
        }
      : {}),
  });
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

  // Always run inline detection first for immediate user feedback
  const html = await fetchHtml(parsed.data.websiteUrl);
  const detections = html ? detectTechStackInline(html) : [];
  const platforms = detections.map((d) => d.platform);

  // Upsert detected integrations into the database as "disconnected" (pending connection)
  try {
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
  } catch (err) {
    console.error('Failed to persist detected integrations:', err instanceof Error ? err.message : String(err));
    // Continue — inline detections are still returned to the user
  }

  // Optionally queue a deeper background analysis via the compatibility agent
  try {
    await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'onboarding_flow',
      priority: 'critical',
      input: { step: 'initiate', websiteUrl: parsed.data.websiteUrl },
    });
  } catch {
    // Queue unavailable — inline results are sufficient
  }

  // Detect if this is a known SPA framework so the frontend can show better guidance
  const isSpa = html
    ? (html.includes('__next') || html.includes('__NEXT_DATA__') || html.includes('_next/static') ||
       html.includes('__nuxt') || html.includes('_nuxt/') ||
       html.includes('ng-version') || html.includes('__SVELTE__') || html.includes('data-reactroot') ||
       html.includes('id="app"') || html.includes('id="root"'))
    : false;

  const detectedFramework = html
    ? (html.includes('__next') || html.includes('__NEXT_DATA__') ? 'Next.js'
      : html.includes('__nuxt') ? 'Nuxt.js'
      : html.includes('ng-version') ? 'Angular'
      : html.includes('__SVELTE__') ? 'SvelteKit'
      : null)
    : null;

  // When no tracking tags found, seed commonly-needed platforms as disconnected
  // so the user can manually connect them from the integrations page
  if (detections.length === 0) {
    const recommendedPlatforms: Platform[] = [
      'google_analytics', 'google_search_console', 'google_ads', 'meta_ads',
    ];
    try {
      await withTenantDb(tenantId, async (db) => {
        for (const platform of recommendedPlatforms) {
          const existing = await db
            .select({ id: integrations.id })
            .from(integrations)
            .where(and(eq(integrations.tenantId, tenantId), eq(integrations.platform, platform)))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(integrations).values({
              tenantId,
              platform,
              status: 'disconnected',
              accessTokenEncrypted: '',
              detectedVia: 'auto_discovery',
              healthScore: 0,
              config: { recommended: true, reason: 'Core platform for marketing automation' },
            });
          }
        }
      });
    } catch (err) {
      console.error('Failed to seed recommended integrations:', err instanceof Error ? err.message : String(err));
    }
  }

  return c.json({
    detections,
    platforms,
    status: 'completed',
    isSpa,
    detectedFramework,
    ...(detections.length === 0 && !html
      ? { message: 'Could not fetch website HTML. The site may be blocking automated requests or require authentication.' }
      : detections.length === 0 && html
      ? {
          message: isSpa
            ? `${detectedFramework ?? 'SPA'} detected — tracking scripts load dynamically and aren't visible in initial HTML. We've added recommended platforms you can connect manually below.`
            : 'No tracking tags detected in page HTML. We\'ve added recommended platforms you can connect manually below.',
          recommendedPlatforms: ['google_analytics', 'google_search_console', 'google_ads', 'meta_ads'],
        }
      : {}),
  });
});

// POST /integrations/onboarding/callback — OAuth callback during onboarding
app.post('/onboarding/callback', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = oauthCallbackSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', parsed.error.issues);
  }

  try {
    const taskId = await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'onboarding_flow',
      priority: 'critical',
      input: { step: 'oauth_callback', platform: parsed.data.platform, code: parsed.data.code },
    });
    return c.json({ taskId, status: 'queued' });
  } catch {
    return c.json({ status: 'completed', message: 'Callback received' });
  }
});

// POST /integrations/onboarding/complete — finalize onboarding
app.post('/onboarding/complete', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const taskId = await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'onboarding_flow',
      priority: 'critical',
      input: { step: 'complete' },
    });
    return c.json({ taskId, status: 'queued' });
  } catch {
    return c.json({ status: 'completed', message: 'Onboarding finalized' });
  }
});

// POST /integrations/onboarding/step-back — go back one step
app.post('/onboarding/step-back', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const taskId = await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'onboarding_flow',
      priority: 'critical',
      input: { step: 'step_back' },
    });
    return c.json({ ok: true, taskId, status: 'queued' });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 400);
  }
});

// POST /integrations/onboarding/pause — pause onboarding
app.post('/onboarding/pause', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const taskId = await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'onboarding_flow',
      priority: 'critical',
      input: { step: 'pause' },
    });
    return c.json({ ok: true, taskId, status: 'queued' });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 400);
  }
});

// POST /integrations/onboarding/resume — resume paused onboarding
app.post('/onboarding/resume', async (c) => {
  const tenantId = c.get('tenantId');

  try {
    const taskId = await publishAgentTask({
      tenantId,
      agentType: 'compatibility',
      type: 'onboarding_flow',
      priority: 'critical',
      input: { step: 'resume' },
    });
    return c.json({ ok: true, taskId, status: 'queued' });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 400);
  }
});

export const integrationRoutes = app;
