/**
 * Analytics Detector — detects analytics platforms from HTML.
 */

import type { TechStackDetection } from '@nexuszero/shared';

export function detectAnalytics(html: string): TechStackDetection[] {
  const detections: TechStackDetection[] = [];

  // Google Analytics (GA4)
  const ga4Score = detectGA4(html);
  if (ga4Score > 0) {
    detections.push({
      platform: 'google_analytics',
      confidence: ga4Score,
      detectedVia: 'html_analysis',
      evidence: 'GA4 measurement ID or gtag.js detected',
    });
  }

  // Mixpanel
  const mixScore = detectMixpanel(html);
  if (mixScore > 0) {
    detections.push({
      platform: 'mixpanel',
      confidence: mixScore,
      detectedVia: 'html_analysis',
      evidence: 'Mixpanel SDK script or mixpanel.init() call',
    });
  }

  // Amplitude
  const ampScore = detectAmplitude(html);
  if (ampScore > 0) {
    detections.push({
      platform: 'amplitude',
      confidence: ampScore,
      detectedVia: 'html_analysis',
      evidence: 'Amplitude SDK or amplitude.init() call',
    });
  }

  return detections;
}

function detectGA4(html: string): number {
  let score = 0;

  // gtag.js with G- measurement ID (GA4)
  const ga4IdMatch = html.match(/G-[A-Z0-9]{6,}/);
  if (ga4IdMatch) score += 0.6;

  // Google Tag Manager (often loads GA4)
  if (html.includes('googletagmanager.com/gtag/js') || html.includes('gtag(')) score += 0.3;

  // GTM container
  if (html.includes('googletagmanager.com/gtm.js')) score += 0.2;

  // Legacy UA tag (still counts for analytics detection)
  const uaMatch = html.match(/UA-\d+-\d+/);
  if (uaMatch) score += 0.15;

  return Math.min(score, 1);
}

function detectMixpanel(html: string): number {
  let score = 0;

  if (html.includes('cdn.mxpnl.com') || html.includes('mixpanel.com/libs/')) score += 0.6;
  if (html.includes('mixpanel.init(') || html.includes('mixpanel.track(')) score += 0.4;

  return Math.min(score, 1);
}

function detectAmplitude(html: string): number {
  let score = 0;

  if (html.includes('cdn.amplitude.com') || html.includes('amplitude.com/libs/')) score += 0.6;
  if (html.includes('amplitude.init(') || html.includes('amplitude.getInstance()')) score += 0.4;

  return Math.min(score, 1);
}
