/**
 * Stack Detector — Orchestrates the discovery of a website's tech stack.
 * Given a URL, it detects CMS, analytics, ad platforms, CRM, and more.
 */

import { isIP } from 'node:net';
import { promises as dnsPromises } from 'node:dns';
import type { TechStackDetection, DetectedTechnology, Platform } from '@nexuszero/shared';
import { detectCms } from './cms-detector.js';
import { detectAnalytics } from './analytics-detector.js';
import { detectAdPixels } from './ad-pixel-detector.js';
import { detectCrm } from './crm-detector.js';
import { analyzeDns } from './dns-analyzer.js';
import { classifyBusiness } from './business-classifier.js';

let renderPage: ((url: string, options?: any) => Promise<any>) | null = null;
try {
  const renderer = await import('@nexuszero/renderer');
  renderPage = renderer.renderPage;
} catch {
  // Renderer not available — SPA fallback disabled
}

// ── SSRF protection ────────────────────────────────────────────────────────

/** Returns true if the raw IP string falls in a private/reserved range. */
function isPrivateIpAddress(ip: string): boolean {
  // IPv4
  const parts = ip.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number) as [number, number];
    if (a === 0) return true;                              // 0.0.0.0/8 – "this" network
    if (a === 10) return true;                             // 10.0.0.0/8 – RFC-1918
    if (a === 127) return true;                            // 127.0.0.0/8 – loopback
    if (a === 100 && b >= 64 && b <= 127) return true;    // 100.64.0.0/10 – RFC-6598 shared
    if (a === 169 && b === 254) return true;               // 169.254.0.0/16 – link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16.0.0/12 – RFC-1918
    if (a === 192 && b === 168) return true;               // 192.168.0.0/16 – RFC-1918
    if (a === 198 && b === 51) return true;                // 198.51.100.0/24 – TEST-NET-2
    if (a === 203 && b === 0) return true;                 // 203.0.113.0/24 – TEST-NET-3
  }
  // IPv6
  const low = ip.toLowerCase();
  if (low === '::1') return true;                          // loopback
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // unique-local
  if (low.startsWith('fe80')) return true;                 // link-local
  return false;
}

/**
 * Resolves `url`'s hostname and returns true when the destination is a
 * private/internal address (SSRF target).  All unparseable or unresolvable
 * URLs are treated as unsafe.
 */
async function isSSRFTarget(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  // Only allow HTTP(S)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return true;

  const { hostname } = parsed;

  // Block well-known dangerous hostnames without a DNS round-trip
  if (
    hostname === 'localhost' ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) return true;

  // If the hostname IS already an IP, check it directly
  if (isIP(hostname)) return isPrivateIpAddress(hostname);

  // Resolve DNS and inspect every returned address
  try {
    const addresses = await dnsPromises.lookup(hostname, { all: true });
    return addresses.some(({ address }) => isPrivateIpAddress(address));
  } catch {
    // DNS failure → treat as unsafe
    return true;
  }
}

export interface StackDetectionResult {
  detections: DetectedTechnology[];
  platforms: Platform[];
  confidence: number;
  analyzedUrl: string;
  analyzedAt: Date;
  emailPlatforms: DetectedTechnology[];
  paymentProcessors: DetectedTechnology[];
  socialProfiles: { platform: string; url: string }[];
  businessType: string | null;
}

/** Detect the full tech stack of a website */
export async function detectTechStack(url: string): Promise<StackDetectionResult> {
  const normalizedUrl = normalizeUrl(url);

  // Fetch the page HTML
  let html = await fetchPageHtml(normalizedUrl);

  // SPA fallback: if HTML is mostly empty/minimal, try rendering with Playwright
  if (html && isSpaShell(html) && renderPage) {
    try {
      const rendered = await renderPage(normalizedUrl, {
        timeout: 20_000,
        blockResources: ['image', 'media', 'font'],
      });
      if (rendered.html && rendered.html.length > (html?.length || 0)) {
        html = rendered.html;
      }
    } catch (e) {
      console.warn('[stack-detector] SPA render fallback failed:', (e as Error).message);
    }
  }

  if (!html) {
    return {
      detections: [],
      platforms: [],
      confidence: 0,
      analyzedUrl: normalizedUrl,
      analyzedAt: new Date(),
      emailPlatforms: [],
      paymentProcessors: [],
      socialProfiles: [],
      businessType: null,
    };
  }

  // Run all detectors in parallel
  const [cmsResults, analyticsResults, adResults, crmResults, dnsResults] = await Promise.all([
    detectCms(html, normalizedUrl),
    detectAnalytics(html),
    detectAdPixels(html),
    detectCrm(html, normalizedUrl),
    analyzeDns(normalizedUrl),
  ]);

  // Additional detectors: email, payment, social
  const emailPlatforms = detectEmailPlatforms(html);
  const paymentProcessors = detectPaymentProcessors(html);
  const socialProfiles = detectSocialProfiles(html, normalizedUrl);

  const allDetections = [
    ...cmsResults, ...analyticsResults, ...adResults, ...crmResults, ...dnsResults,
    ...emailPlatforms, ...paymentProcessors,
  ];

  // Deduplicate by platform, keeping highest confidence
  const platformMap = new Map<Platform, DetectedTechnology>();
  for (const detection of allDetections) {
    const existing = platformMap.get(detection.platform);
    if (!existing || detection.confidence > existing.confidence) {
      platformMap.set(detection.platform, detection);
    }
  }

  const detections = Array.from(platformMap.values()).sort((a, b) => b.confidence - a.confidence);
  const platforms = detections.map((d) => d.platform);
  const avgConfidence = detections.length > 0
    ? detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length
    : 0;

  // Run business classification in parallel with final assembly
  let businessType: string | null = null;
  try {
    businessType = await classifyBusiness(html, detections, normalizedUrl);
  } catch {
    // Business classification is non-critical
  }

  return {
    detections,
    platforms,
    confidence: avgConfidence,
    analyzedUrl: normalizedUrl,
    analyzedAt: new Date(),
    emailPlatforms,
    paymentProcessors,
    socialProfiles,
    businessType,
  };
}

/** Fetch the HTML of a page — rejects SSRF targets before any network I/O. */
async function fetchPageHtml(url: string): Promise<string | null> {
  // Guard against SSRF: block private/internal addresses (resolves DNS)
  if (await isSSRFTarget(url)) {
    console.warn(`[stack-detector] Rejected SSRF target URL: ${url}`);
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NexusZero-Bot/1.0 (StackDetection)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15000),
      // Do NOT follow redirects automatically — a redirect could land on a
      // private host that passed the pre-fetch DNS check.
      redirect: 'manual',
    });

    // Follow only same-host HTTPS redirects (301/302/307/308)
    if (response.status >= 301 && response.status <= 308) {
      const location = response.headers.get('location');
      if (!location) return null;
      // Re-validate the redirect target
      const absolute = new URL(location, url).href;
      if (await isSSRFTarget(absolute)) {
        console.warn(`[stack-detector] Rejected SSRF redirect target: ${absolute}`);
        return null;
      }
      const redirected = await fetch(absolute, {
        headers: { 'User-Agent': 'NexusZero-Bot/1.0 (StackDetection)', Accept: 'text/html' },
        signal: AbortSignal.timeout(15000),
        redirect: 'error', // No further redirects
      });
      if (!redirected.ok) return null;
      const ct2 = redirected.headers.get('content-type') ?? '';
      if (!ct2.includes('text/html')) return null;
      return await redirected.text();
    }

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return null;

    return await response.text();
  } catch {
    return null;
  }
}

/** Normalize a URL to include protocol */
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  // Remove trailing slash
  return normalized.replace(/\/+$/, '');
}

/** Detect if HTML is a minimal SPA shell (mostly empty body with JS bundles) */
function isSpaShell(html: string): boolean {
  // Strip scripts and styles, then check text content length
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // If text content is very short but HTML is substantial, likely SPA
  return stripped.length < 200 && html.length > 500;
}

// ── Email platform detection ────────────────────────────────────────────────

const EMAIL_SIGNATURES: Array<{ pattern: RegExp; platform: Platform; name: string }> = [
  { pattern: /mailchimp\.com|mc\.us\d+\.list-manage\.com|chimpstatic\.com/i, platform: 'mailchimp' as Platform, name: 'Mailchimp' },
  { pattern: /klaviyo\.com|a\.]klaviyo\.com|static\.klaviyo\.com/i, platform: 'klaviyo' as Platform, name: 'Klaviyo' },
  { pattern: /sendgrid\.(com|net)|mc\.sendgrid\.com/i, platform: 'sendgrid' as Platform, name: 'SendGrid' },
  { pattern: /convertkit\.com|ck\.page/i, platform: 'convertkit' as Platform, name: 'ConvertKit' },
  { pattern: /activecampaign\.com/i, platform: 'activecampaign' as Platform, name: 'ActiveCampaign' },
  { pattern: /mailerlite\.com/i, platform: 'mailerlite' as Platform, name: 'MailerLite' },
  { pattern: /constantcontact\.com/i, platform: 'constantcontact' as Platform, name: 'Constant Contact' },
  { pattern: /campaign-archive\.com|eepurl\.com/i, platform: 'mailchimp' as Platform, name: 'Mailchimp' },
];

function detectEmailPlatforms(html: string): DetectedTechnology[] {
  const results: DetectedTechnology[] = [];
  for (const sig of EMAIL_SIGNATURES) {
    if (sig.pattern.test(html)) {
      results.push({
        platform: sig.platform,
        name: sig.name,
        category: 'email',
        confidence: 0.85,
        evidence: `Matched pattern: ${sig.pattern.source}`,
      } as DetectedTechnology);
    }
  }
  return results;
}

// ── Payment processor detection ─────────────────────────────────────────────

const PAYMENT_SIGNATURES: Array<{ pattern: RegExp; platform: Platform; name: string }> = [
  { pattern: /js\.stripe\.com|stripe\.com\/v3|Stripe\(/i, platform: 'stripe' as Platform, name: 'Stripe' },
  { pattern: /paypal\.com\/sdk|paypalobjects\.com/i, platform: 'paypal' as Platform, name: 'PayPal' },
  { pattern: /squareup\.com|square\.site|web-payments-sdk/i, platform: 'square' as Platform, name: 'Square' },
  { pattern: /braintree-api\.com|braintreegateway\.com/i, platform: 'braintree' as Platform, name: 'Braintree' },
  { pattern: /paddle\.com\/paddlejs/i, platform: 'paddle' as Platform, name: 'Paddle' },
  { pattern: /lemonsqueezy\.com/i, platform: 'lemonsqueezy' as Platform, name: 'Lemon Squeezy' },
];

function detectPaymentProcessors(html: string): DetectedTechnology[] {
  const results: DetectedTechnology[] = [];
  for (const sig of PAYMENT_SIGNATURES) {
    if (sig.pattern.test(html)) {
      results.push({
        platform: sig.platform,
        name: sig.name,
        category: 'payment',
        confidence: 0.9,
        evidence: `Matched pattern: ${sig.pattern.source}`,
      } as DetectedTechnology);
    }
  }
  return results;
}

// ── Social profile link detection ───────────────────────────────────────────

const SOCIAL_LINK_PATTERNS: Array<{ pattern: RegExp; platform: string }> = [
  { pattern: /https?:\/\/(www\.)?twitter\.com\/[a-zA-Z0-9_]+/i, platform: 'twitter' },
  { pattern: /https?:\/\/(www\.)?x\.com\/[a-zA-Z0-9_]+/i, platform: 'twitter' },
  { pattern: /https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i, platform: 'facebook' },
  { pattern: /https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+/i, platform: 'instagram' },
  { pattern: /https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9_-]+/i, platform: 'linkedin' },
  { pattern: /https?:\/\/(www\.)?youtube\.com\/(c|channel|@)[a-zA-Z0-9_-]+/i, platform: 'youtube' },
  { pattern: /https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9._]+/i, platform: 'tiktok' },
  { pattern: /https?:\/\/(www\.)?pinterest\.com\/[a-zA-Z0-9_]+/i, platform: 'pinterest' },
  { pattern: /https?:\/\/(www\.)?reddit\.com\/(r|u(ser)?)\/[a-zA-Z0-9_]+/i, platform: 'reddit' },
  { pattern: /https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+/i, platform: 'github' },
];

function detectSocialProfiles(html: string, siteUrl: string): { platform: string; url: string }[] {
  const results: { platform: string; url: string }[] = [];
  const seen = new Set<string>();
  const siteHost = new URL(siteUrl).hostname.replace('www.', '');

  for (const { pattern, platform } of SOCIAL_LINK_PATTERNS) {
    const matches = html.match(new RegExp(pattern.source, 'gi'));
    if (!matches) continue;
    for (const match of matches) {
      // Skip self-referential links
      try {
        const matchHost = new URL(match).hostname.replace('www.', '');
        if (matchHost === siteHost) continue;
      } catch { continue; }
      const key = `${platform}:${match.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ platform, url: match });
    }
  }
  return results;
}
