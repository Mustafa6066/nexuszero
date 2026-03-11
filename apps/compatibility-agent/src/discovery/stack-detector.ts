/**
 * Stack Detector — Orchestrates the discovery of a website's tech stack.
 * Given a URL, it detects CMS, analytics, ad platforms, CRM, and more.
 */

import { isIP } from 'node:net';
import { promises as dnsPromises } from 'node:dns';
import type { TechStackDetection, Platform } from '@nexuszero/shared';
import { detectCms } from './cms-detector.js';
import { detectAnalytics } from './analytics-detector.js';
import { detectAdPixels } from './ad-pixel-detector.js';
import { detectCrm } from './crm-detector.js';
import { analyzeDns } from './dns-analyzer.js';

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
  detections: TechStackDetection[];
  platforms: Platform[];
  confidence: number;
  analyzedUrl: string;
  analyzedAt: Date;
}

/** Detect the full tech stack of a website */
export async function detectTechStack(url: string): Promise<StackDetectionResult> {
  const normalizedUrl = normalizeUrl(url);

  // Fetch the page HTML
  const html = await fetchPageHtml(normalizedUrl);
  if (!html) {
    return {
      detections: [],
      platforms: [],
      confidence: 0,
      analyzedUrl: normalizedUrl,
      analyzedAt: new Date(),
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

  const allDetections = [...cmsResults, ...analyticsResults, ...adResults, ...crmResults, ...dnsResults];

  // Deduplicate by platform, keeping highest confidence
  const platformMap = new Map<Platform, TechStackDetection>();
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

  return {
    detections,
    platforms,
    confidence: avgConfidence,
    analyzedUrl: normalizedUrl,
    analyzedAt: new Date(),
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
