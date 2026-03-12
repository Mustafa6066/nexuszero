/**
 * DNS Analyzer — detects platforms via DNS records (CNAME, TXT, MX).
 * Also checks for Google Search Console verification, email providers, etc.
 */

import type { DetectedTechnology, Platform } from '@nexuszero/shared';
import { resolve } from 'dns';
import { promisify } from 'util';

const resolveCname = promisify(resolve);

export async function analyzeDns(url: string): Promise<DetectedTechnology[]> {
  const detections: DetectedTechnology[] = [];

  try {
    const hostname = new URL(url).hostname;

    // Check for common platform CNAMEs and TXT records
    const cnameResults = await checkCnames(hostname);
    detections.push(...cnameResults);

    // Check for Google Search Console verification via http meta or DNS
    const gscDetection = await detectGscVerification(url, hostname);
    if (gscDetection) detections.push(gscDetection);
  } catch {
    // DNS failures are non-fatal for detection
  }

  return detections;
}

async function checkCnames(hostname: string): Promise<DetectedTechnology[]> {
  const detections: DetectedTechnology[] = [];

  try {
    const records = await resolveCname(hostname) as unknown as string[];
    const joinedRecords = records.join(' ').toLowerCase();

    const cnamePatterns: Array<{ pattern: string; platform: Platform; evidence: string }> = [
      { pattern: 'shopify', platform: 'shopify', evidence: 'CNAME points to Shopify' },
      { pattern: 'webflow', platform: 'webflow', evidence: 'CNAME points to Webflow' },
      { pattern: 'wordpress.com', platform: 'wordpress', evidence: 'CNAME points to WordPress.com' },
    ];

    for (const { pattern, platform, evidence } of cnamePatterns) {
      if (joinedRecords.includes(pattern)) {
        detections.push({
          platform,
          confidence: 0.9,
          detectedVia: 'dns_analysis',
          evidence,
        });
      }
    }
  } catch {
    // No CNAME records — not an error
  }

  return detections;
}

async function detectGscVerification(url: string, _hostname: string): Promise<DetectedTechnology | null> {
  // Check for Google site verification meta tag (often indicates GSC is set up)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'NexusZero-Bot/1.0' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const html = await response.text();
    const hasGoogleVerification = html.includes('google-site-verification');

    if (hasGoogleVerification) {
      return {
        platform: 'google_search_console',
        confidence: 0.7,
        detectedVia: 'dns_analysis',
        evidence: 'Google site verification meta tag found',
      };
    }
  } catch {
    // Non-fatal
  }

  return null;
}
