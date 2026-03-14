/**
 * Pre-flight Website Scanner Service
 *
 * Scans any domain and produces a comprehensive readiness report for EaaS onboarding.
 * Detects: CMS, analytics, ad pixels, CRM, SEO baseline, SSL, performance.
 * Outputs a requirements checklist showing what's ready vs what needs setup.
 */

import { isIP } from 'node:net';
import { promises as dnsPromises } from 'node:dns';
import type {
  Platform,
  DetectedTechnology,
  DnsAnalysis,
  PreflightScanResult,
  ScanCheckItem,
  SeoBaseline,
  SecurityInfo,
  PerformanceHints,
  ReadinessStatus,
} from '@nexuszero/shared';

// ── SSRF Protection (mirrors stack-detector.ts) ───────────────────────────

function isPrivateIpAddress(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number) as [number, number];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  const low = ip.toLowerCase();
  if (low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80')) return true;
  return false;
}

async function isSSRFTarget(url: string): Promise<boolean> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return true; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return true;
  const { hostname } = parsed;
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      hostname === 'metadata.google.internal') return true;
  if (isIP(hostname)) return isPrivateIpAddress(hostname);
  try {
    const addresses = await dnsPromises.lookup(hostname, { all: true });
    return addresses.some(({ address }: { address: string }) => isPrivateIpAddress(address));
  } catch { return true; }
}

function normalizeUrl(url: string): string {
  let n = url.trim();
  if (!n.startsWith('http://') && !n.startsWith('https://')) n = `https://${n}`;
  return n.replace(/\/+$/, '');
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; }
  catch { return url.replace(/^https?:\/\//, '').split('/')[0] ?? url; }
}

// ── Fetch helpers ──────────────────────────────────────────────────────────

async function safeFetch(url: string, opts?: RequestInit): Promise<Response | null> {
  if (await isSSRFTarget(url)) return null;
  try {
    return await fetch(url, {
      ...opts,
      headers: {
        'User-Agent': 'NexusZero-Scanner/1.0',
        Accept: 'text/html,application/xhtml+xml,*/*',
        ...(opts?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
  } catch { return null; }
}

async function fetchHtml(url: string): Promise<{ html: string; responseMs: number; headers: Headers } | null> {
  const start = Date.now();
  const resp = await safeFetch(url);
  if (!resp || !resp.ok) return null;
  const ct = resp.headers.get('content-type') ?? '';
  if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null;
  const html = await resp.text();
  return { html, responseMs: Date.now() - start, headers: resp.headers };
}

// ── Tech detection (inline, no external deps) ─────────────────────────────

function detectTechFromHtml(html: string): DetectedTechnology[] {
  const detections: DetectedTechnology[] = [];
  const add = (platform: Platform, confidence: number, evidence: string) => {
    if (confidence > 0) detections.push({ platform, confidence: Math.min(confidence, 1), evidence });
  };

  // Analytics
  let ga = 0;
  if (html.match(/G-[A-Z0-9]{4,}/)) ga += 0.6;
  if (html.includes('googletagmanager.com/gtag')) ga += 0.3;
  if (html.includes('google-analytics.com/analytics.js')) ga += 0.3;
  add('google_analytics', ga, 'Google Analytics / GA4 tag');

  // Google Ads
  let gads = 0;
  if (html.match(/AW-\d{6,}/)) gads += 0.6;
  if (html.includes('googleads.g.doubleclick.net')) gads += 0.3;
  if (html.includes('gtag(') && html.includes('conversion')) gads += 0.2;
  add('google_ads', gads, 'Google Ads conversion/remarketing tag');

  // Meta Pixel
  let meta = 0;
  if (html.includes('connect.facebook.net') || html.includes('fbq(')) meta += 0.6;
  if (html.includes('facebook.com/tr?id=')) meta += 0.2;
  add('meta_ads', meta, 'Meta/Facebook pixel');

  // LinkedIn
  let li = 0;
  if (html.includes('snap.licdn.com')) li += 0.7;
  if (html.includes('_linkedin_partner_id')) li += 0.3;
  add('linkedin_ads', li, 'LinkedIn Insight Tag');

  // HubSpot
  let hs = 0;
  if (html.includes('js.hs-scripts.com') || html.includes('js.hsforms.net')) hs += 0.6;
  if (html.includes('hbspt.forms.create')) hs += 0.3;
  add('hubspot', hs, 'HubSpot tracking/forms');

  // Salesforce
  let sf = 0;
  if (html.includes('pardot.com')) sf += 0.5;
  if (html.includes('webto.salesforce.com')) sf += 0.5;
  add('salesforce', sf, 'Salesforce/Pardot');

  // CMS detection
  let wp = 0;
  if (html.includes('/wp-content/') || html.includes('/wp-includes/')) wp += 0.5;
  if (html.toLowerCase().includes('generator" content="wordpress')) wp += 0.4;
  add('wordpress', wp, 'WordPress');

  let wf = 0;
  if (html.toLowerCase().includes('generator" content="webflow')) wf += 0.6;
  if (html.includes('data-wf-site')) wf += 0.3;
  add('webflow', wf, 'Webflow');

  let sh = 0;
  if (html.includes('cdn.shopify.com')) sh += 0.5;
  if (html.includes('myshopify.com') || html.includes('Shopify.shop')) sh += 0.3;
  add('shopify', sh, 'Shopify');

  let cf = 0;
  if (html.includes('ctfassets.net')) cf += 0.5;
  add('contentful', cf, 'Contentful');

  // Mixpanel / Amplitude
  let mx = 0;
  if (html.includes('cdn.mxpnl.com') || html.includes('mixpanel.init(')) mx += 0.6;
  add('mixpanel', mx, 'Mixpanel');

  let amp = 0;
  if (html.includes('cdn.amplitude.com') || html.includes('amplitude.init(')) amp += 0.6;
  add('amplitude', amp, 'Amplitude');

  // Stripe
  let stripe = 0;
  if (html.includes('js.stripe.com')) stripe += 0.7;
  add('stripe_connect', stripe, 'Stripe.js');

  // Google Search Console
  let gsc = 0;
  if (html.includes('google-site-verification')) gsc += 0.5;
  add('google_search_console', gsc, 'Google Search Console verification');

  return detections.sort((a, b) => b.confidence - a.confidence);
}

// ── SEO baseline ───────────────────────────────────────────────────────────

function analyzeSeo(html: string): SeoBaseline {
  const lower = html.toLowerCase();
  return {
    hasMetaTitle: /<title[^>]*>.+<\/title>/is.test(html),
    hasMetaDescription: lower.includes('name="description"') || lower.includes("name='description'"),
    hasOpenGraph: lower.includes('property="og:') || lower.includes("property='og:"),
    hasStructuredData: html.includes('application/ld+json') || html.includes('itemtype="http://schema.org'),
    hasCanonical: lower.includes('rel="canonical"') || lower.includes("rel='canonical'"),
    hasHreflang: lower.includes('hreflang='),
    hasRobotsTxt: false, // filled separately
    hasSitemap: false,   // filled separately
  };
}

async function checkRobotsTxt(baseUrl: string): Promise<{ exists: boolean; hasSitemap: boolean }> {
  const resp = await safeFetch(`${baseUrl}/robots.txt`);
  if (!resp || !resp.ok) return { exists: false, hasSitemap: false };
  const text = await resp.text();
  return { exists: true, hasSitemap: text.toLowerCase().includes('sitemap:') };
}

async function checkSitemap(baseUrl: string): Promise<boolean> {
  const resp = await safeFetch(`${baseUrl}/sitemap.xml`);
  return resp !== null && resp.ok;
}

// ── DNS analysis ───────────────────────────────────────────────────────────

async function analyzeDns(domain: string): Promise<DnsAnalysis | null> {
  try {
    const [mxRecords, txtRecords] = await Promise.all([
      dnsPromises.resolveMx(domain).catch(() => []),
      dnsPromises.resolveTxt(domain).catch(() => []),
    ]);
    const flatTxt = txtRecords.map((r: string[]) => r.join('')).filter(Boolean);
    const spf = flatTxt.find((t: string) => t.startsWith('v=spf1')) ?? null;
    const providers: string[] = [];
    const mxHosts: string[] = mxRecords.map((r: { exchange: string }) => r.exchange.toLowerCase());
    if (mxHosts.some((h: string) => h.includes('google') || h.includes('gmail'))) providers.push('google_workspace');
    if (mxHosts.some((h: string) => h.includes('outlook') || h.includes('microsoft'))) providers.push('microsoft_365');
    if (flatTxt.some((t: string) => t.includes('hubspot'))) providers.push('hubspot');
    if (flatTxt.some((t: string) => t.includes('salesforce'))) providers.push('salesforce');
    return {
      mxRecords: mxHosts,
      spfRecord: spf,
      txtRecords: flatTxt,
      inferredProviders: providers,
    };
  } catch { return null; }
}

// ── Security checks ────────────────────────────────────────────────────────

async function checkSecurity(url: string, headers: Headers): Promise<SecurityInfo> {
  const hasHttps = url.startsWith('https://');
  let redirectsToHttps = false;
  if (!hasHttps) {
    const resp = await safeFetch(url.replace('https://', 'http://'));
    redirectsToHttps = resp !== null && resp.url?.startsWith('https://');
  }
  return {
    hasHttps,
    redirectsToHttps: hasHttps || redirectsToHttps,
    hasHsts: !!headers.get('strict-transport-security'),
  };
}

// ── Build checklist ────────────────────────────────────────────────────────

function buildChecklist(
  detections: DetectedTechnology[],
  seo: SeoBaseline,
  security: SecurityInfo,
  perf: PerformanceHints,
  dns: DnsAnalysis | null,
): ScanCheckItem[] {
  const items: ScanCheckItem[] = [];
  const detected = new Set(detections.map((d) => d.platform));

  // Analytics
  const hasAnalytics = detected.has('google_analytics') || detected.has('mixpanel') || detected.has('amplitude');
  items.push({
    category: 'analytics',
    label: 'Web Analytics',
    status: hasAnalytics ? 'detected' : 'missing',
    detail: hasAnalytics
      ? `Found: ${detections.filter((d) => ['google_analytics', 'mixpanel', 'amplitude'].includes(d.platform)).map((d) => d.evidence).join(', ')}`
      : 'No analytics platform detected. NexusZero will connect Google Analytics or provide built-in tracking.',
    platform: hasAnalytics ? detections.find((d) => ['google_analytics', 'mixpanel', 'amplitude'].includes(d.platform))?.platform : undefined,
    confidence: detections.find((d) => ['google_analytics', 'mixpanel', 'amplitude'].includes(d.platform))?.confidence,
  });

  // Search Console
  items.push({
    category: 'seo',
    label: 'Google Search Console',
    status: detected.has('google_search_console') ? 'detected' : 'recommended',
    detail: detected.has('google_search_console')
      ? 'Site verification tag found — GSC can be auto-connected.'
      : 'No GSC verification found. Recommended for SEO agent to access ranking data.',
    platform: 'google_search_console',
  });

  // Advertising
  const adPlatforms: Platform[] = ['google_ads', 'meta_ads', 'linkedin_ads'];
  const foundAds = adPlatforms.filter((p) => detected.has(p));
  items.push({
    category: 'advertising',
    label: 'Ad Pixels',
    status: foundAds.length > 0 ? 'detected' : 'missing',
    detail: foundAds.length > 0
      ? `Found: ${foundAds.join(', ')}. NexusZero Ad Agent can optimize these.`
      : 'No ad pixels detected. NexusZero can deploy Google Ads & Meta Ads campaigns.',
  });

  // CRM
  const crmPlatforms: Platform[] = ['hubspot', 'salesforce'];
  const foundCrm = crmPlatforms.filter((p) => detected.has(p));
  items.push({
    category: 'crm',
    label: 'CRM Integration',
    status: foundCrm.length > 0 ? 'detected' : 'recommended',
    detail: foundCrm.length > 0
      ? `Found: ${foundCrm.join(', ')}. Lead data can flow automatically.`
      : 'No CRM detected. Recommended for lead tracking and funnel attribution.',
  });

  // CMS
  const cmsPlatforms: Platform[] = ['wordpress', 'webflow', 'shopify', 'contentful'];
  const foundCms = cmsPlatforms.filter((p) => detected.has(p));
  items.push({
    category: 'cms',
    label: 'CMS / Website Platform',
    status: foundCms.length > 0 ? 'detected' : 'partial',
    detail: foundCms.length > 0
      ? `Detected: ${foundCms.join(', ')}. SEO agent can push content updates.`
      : 'CMS not identified. Manual content deployment may be needed.',
  });

  // SEO checks
  items.push({
    category: 'seo',
    label: 'Meta Title',
    status: seo.hasMetaTitle ? 'detected' : 'missing',
    detail: seo.hasMetaTitle ? 'Page has a meta title.' : 'Missing <title> tag — critical for SEO.',
  });
  items.push({
    category: 'seo',
    label: 'Meta Description',
    status: seo.hasMetaDescription ? 'detected' : 'missing',
    detail: seo.hasMetaDescription ? 'Meta description present.' : 'Missing meta description — impacts click-through rates.',
  });
  items.push({
    category: 'seo',
    label: 'Open Graph Tags',
    status: seo.hasOpenGraph ? 'detected' : 'recommended',
    detail: seo.hasOpenGraph ? 'OG tags found for social sharing.' : 'No OG tags — social sharing will lack rich previews.',
  });
  items.push({
    category: 'seo',
    label: 'Structured Data',
    status: seo.hasStructuredData ? 'detected' : 'recommended',
    detail: seo.hasStructuredData ? 'JSON-LD or Schema.org markup found.' : 'No structured data — AEO agent will add this for AI visibility.',
  });
  items.push({
    category: 'seo',
    label: 'Robots.txt',
    status: seo.hasRobotsTxt ? 'detected' : 'missing',
    detail: seo.hasRobotsTxt ? 'robots.txt exists.' : 'No robots.txt — search engines may not crawl optimally.',
  });
  items.push({
    category: 'seo',
    label: 'XML Sitemap',
    status: seo.hasSitemap ? 'detected' : 'missing',
    detail: seo.hasSitemap ? 'Sitemap found.' : 'No sitemap detected — SEO agent will generate one.',
  });
  items.push({
    category: 'seo',
    label: 'Canonical Tags',
    status: seo.hasCanonical ? 'detected' : 'recommended',
    detail: seo.hasCanonical ? 'Canonical URL set.' : 'No canonical tag — may cause duplicate content issues.',
  });

  // Security
  items.push({
    category: 'security',
    label: 'HTTPS',
    status: security.hasHttps ? 'detected' : 'missing',
    detail: security.hasHttps ? 'Site serves over HTTPS.' : 'No HTTPS — required for secure integrations.',
  });
  items.push({
    category: 'security',
    label: 'HSTS Header',
    status: security.hasHsts ? 'detected' : 'recommended',
    detail: security.hasHsts ? 'HSTS header present.' : 'No HSTS — recommended for security hardening.',
  });

  // Performance
  const perfStatus: ReadinessStatus = perf.serverResponseMs < 1000 ? 'detected' : perf.serverResponseMs < 3000 ? 'partial' : 'missing';
  items.push({
    category: 'performance',
    label: 'Server Response Time',
    status: perfStatus,
    detail: `Server responded in ${perf.serverResponseMs}ms${perf.serverResponseMs > 3000 ? ' — slow response may impact user experience.' : '.'}`,
  });
  items.push({
    category: 'performance',
    label: 'Compression',
    status: perf.hasCompression ? 'detected' : 'recommended',
    detail: perf.hasCompression ? 'Response compression enabled.' : 'No compression detected — gzip/brotli recommended.',
  });

  return items;
}

// ── Readiness scoring ──────────────────────────────────────────────────────

function calculateReadinessScore(checklist: ScanCheckItem[]): number {
  const weights: Record<string, number> = {
    detected: 1,
    partial: 0.5,
    recommended: 0.3, // not blocking, but nice to have
    missing: 0,
  };
  const total = checklist.length;
  if (total === 0) return 0;
  const score = checklist.reduce((sum, item) => sum + (weights[item.status] ?? 0), 0);
  return Math.round((score / total) * 100);
}

// ── Agent recommendations ──────────────────────────────────────────────────

function recommendAgents(detections: DetectedTechnology[], seo: SeoBaseline): string[] {
  const agents: string[] = [];
  const platforms = new Set(detections.map((d) => d.platform));

  // SEO Agent — always recommended unless everything is perfect
  if (!seo.hasStructuredData || !seo.hasMetaDescription || !seo.hasRobotsTxt || !seo.hasSitemap) {
    agents.push('seo');
  }

  // Ad Agent — if any ad pixel found or recommended
  if (platforms.has('google_ads') || platforms.has('meta_ads') || platforms.has('linkedin_ads')) {
    agents.push('ad');
  } else {
    agents.push('ad'); // Always recommend ad agent for growth
  }

  // AEO Agent — if no structured data
  if (!seo.hasStructuredData) {
    agents.push('aeo');
  }

  // Data Nexus — always useful for multi-source analytics
  agents.push('data_nexus');

  return [...new Set(agents)];
}

// ── Main scanner ───────────────────────────────────────────────────────────

export async function runPreflightScan(websiteUrl: string): Promise<PreflightScanResult> {
  const url = normalizeUrl(websiteUrl);
  const domain = extractDomain(url);

  // Fetch the page
  const pageResult = await fetchHtml(url);
  if (!pageResult) {
    return {
      domain,
      scannedUrl: url,
      scannedAt: new Date().toISOString(),
      readinessScore: 0,
      detectedTech: [],
      dns: null,
      seo: { hasRobotsTxt: false, hasSitemap: false, hasMetaTitle: false, hasMetaDescription: false, hasOpenGraph: false, hasStructuredData: false, hasCanonical: false, hasHreflang: false },
      security: { hasHttps: url.startsWith('https://'), redirectsToHttps: false, hasHsts: false },
      performance: { serverResponseMs: -1, hasCompression: false },
      checklist: [{ category: 'security', label: 'Website Reachable', status: 'missing', detail: `Could not reach ${url}. Ensure the domain is publicly accessible.` }],
      connectablePlatforms: [],
      missingPlatforms: [],
      recommendedAgents: ['seo', 'ad', 'aeo', 'data_nexus'],
    };
  }

  const { html, responseMs, headers } = pageResult;

  // Run all checks in parallel
  const [detections, robots, sitemapExists, dns, security] = await Promise.all([
    Promise.resolve(detectTechFromHtml(html)),
    checkRobotsTxt(url),
    checkSitemap(url),
    analyzeDns(domain),
    checkSecurity(url, headers),
  ]);

  // Build SEO baseline
  const seo = analyzeSeo(html);
  seo.hasRobotsTxt = robots.exists;
  seo.hasSitemap = sitemapExists || robots.hasSitemap;

  // Performance hints
  const performance: PerformanceHints = {
    serverResponseMs: responseMs,
    hasCompression: !!headers.get('content-encoding'),
    contentLengthBytes: parseInt(headers.get('content-length') ?? '0', 10) || undefined,
  };

  // Build checklist
  const checklist = buildChecklist(detections, seo, security, performance, dns);
  const readinessScore = calculateReadinessScore(checklist);

  // Classify platforms
  const detectedPlatforms = new Set(detections.map((d: DetectedTechnology) => d.platform));
  const allAutoConnectable: Platform[] = [
    'google_analytics', 'google_ads', 'google_search_console',
    'meta_ads', 'linkedin_ads', 'hubspot', 'salesforce',
  ];
  const connectablePlatforms = allAutoConnectable.filter((p) => detectedPlatforms.has(p));
  const missingPlatforms = allAutoConnectable.filter((p) => !detectedPlatforms.has(p));

  return {
    domain,
    scannedUrl: url,
    scannedAt: new Date().toISOString(),
    readinessScore,
    detectedTech: detections,
    dns,
    seo,
    security,
    performance,
    checklist,
    connectablePlatforms,
    missingPlatforms,
    recommendedAgents: recommendAgents(detections, seo),
  };
}
