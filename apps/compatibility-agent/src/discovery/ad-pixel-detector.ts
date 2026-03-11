/**
 * Ad Pixel Detector — detects advertising platforms from HTML tracking pixels/scripts.
 */

import type { TechStackDetection } from '@nexuszero/shared';

export function detectAdPixels(html: string): TechStackDetection[] {
  const detections: TechStackDetection[] = [];

  // Google Ads (Conversion tracking, remarketing)
  const gadsScore = detectGoogleAds(html);
  if (gadsScore > 0) {
    detections.push({
      platform: 'google_ads',
      confidence: gadsScore,
      detectedVia: 'html_analysis',
      evidence: 'Google Ads conversion tag, AW- ID, or remarketing pixel',
    });
  }

  // Meta (Facebook) Pixel
  const metaScore = detectMetaPixel(html);
  if (metaScore > 0) {
    detections.push({
      platform: 'meta_ads',
      confidence: metaScore,
      detectedVia: 'html_analysis',
      evidence: 'Meta/Facebook pixel script or fbq() calls',
    });
  }

  // LinkedIn Insight Tag
  const liScore = detectLinkedInInsight(html);
  if (liScore > 0) {
    detections.push({
      platform: 'linkedin_ads',
      confidence: liScore,
      detectedVia: 'html_analysis',
      evidence: 'LinkedIn Insight Tag or partner ID',
    });
  }

  return detections;
}

function detectGoogleAds(html: string): number {
  let score = 0;

  // AW- conversion ID
  const awMatch = html.match(/AW-\d{9,}/);
  if (awMatch) score += 0.6;

  // Google Ads conversion tracking
  if (html.includes('googleadservices.com/pagead/conversion')) score += 0.4;

  // Remarketing tag
  if (html.includes('googlesyndication.com') || html.includes('google_remarketing')) score += 0.2;

  // gads conversion linker
  if (html.includes('conversion_async') || html.includes('googleads.g.doubleclick.net')) score += 0.2;

  return Math.min(score, 1);
}

function detectMetaPixel(html: string): number {
  let score = 0;

  // Facebook pixel base code
  if (html.includes('connect.facebook.net/en_US/fbevents.js') || html.includes('fbq(')) score += 0.6;

  // Pixel ID pattern (numeric, 15-16 digits)
  const pixelIdMatch = html.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{15,16})['"]/);
  if (pixelIdMatch) score += 0.3;

  // Meta pixel noscript fallback
  if (html.includes('facebook.com/tr?id=')) score += 0.2;

  return Math.min(score, 1);
}

function detectLinkedInInsight(html: string): number {
  let score = 0;

  // LinkedIn Insight Tag
  if (html.includes('snap.licdn.com/li.lms-analytics/insight.min.js')) score += 0.7;

  // LinkedIn partner ID
  const partnerMatch = html.match(/_linkedin_partner_id\s*=\s*["'](\d+)["']/);
  if (partnerMatch) score += 0.3;

  // LinkedIn pixel noscript
  if (html.includes('dc.ads.linkedin.com/collect/')) score += 0.2;

  return Math.min(score, 1);
}
