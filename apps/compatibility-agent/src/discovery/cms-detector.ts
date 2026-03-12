/**
 * CMS Detector — detects content management systems from HTML and URL patterns.
 */

import type { DetectedTechnology, Platform } from '@nexuszero/shared';
import * as cheerio from 'cheerio';

export function detectCms(html: string, url: string): DetectedTechnology[] {
  const detections: DetectedTechnology[] = [];
  const $ = cheerio.load(html);

  // WordPress detection
  const wpScore = detectWordPress($, html, url);
  if (wpScore > 0) {
    detections.push({
      platform: 'wordpress',
      confidence: wpScore,
      detectedVia: 'html_analysis',
      evidence: 'WordPress meta tags, wp-content paths, or generator tag',
    });
  }

  // Webflow detection
  const wfScore = detectWebflow($, html);
  if (wfScore > 0) {
    detections.push({
      platform: 'webflow',
      confidence: wfScore,
      detectedVia: 'html_analysis',
      evidence: 'Webflow meta generator, data-wf attributes, or webflow.js',
    });
  }

  // Contentful detection (usually headless, detected via API calls in page JS)
  const cfScore = detectContentful(html);
  if (cfScore > 0) {
    detections.push({
      platform: 'contentful',
      confidence: cfScore,
      detectedVia: 'html_analysis',
      evidence: 'Contentful CDN references or contentful.com API calls',
    });
  }

  // Shopify detection
  const shopScore = detectShopify($, html);
  if (shopScore > 0) {
    detections.push({
      platform: 'shopify',
      confidence: shopScore,
      detectedVia: 'html_analysis',
      evidence: 'Shopify CDN, checkout paths, or meta tags',
    });
  }

  return detections;
}

function detectWordPress($: cheerio.CheerioAPI, html: string, _url: string): number {
  let score = 0;

  // Generator meta tag
  const generator = $('meta[name="generator"]').attr('content') ?? '';
  if (generator.toLowerCase().includes('wordpress')) score += 0.5;

  // wp-content or wp-includes paths
  if (html.includes('/wp-content/') || html.includes('/wp-includes/')) score += 0.3;

  // wp-json REST API link
  if ($('link[rel="https://api.w.org/"]').length > 0) score += 0.2;

  // wp-emoji or dashicons
  if (html.includes('wp-emoji') || html.includes('dashicons')) score += 0.1;

  return Math.min(score, 1);
}

function detectWebflow($: cheerio.CheerioAPI, html: string): number {
  let score = 0;

  const generator = $('meta[name="generator"]').attr('content') ?? '';
  if (generator.toLowerCase().includes('webflow')) score += 0.6;

  // data-wf-* attributes are Webflow-specific
  if (html.includes('data-wf-site') || html.includes('data-wf-page')) score += 0.3;

  // Webflow JS
  if (html.includes('webflow.js') || html.includes('assets.website-files.com')) score += 0.2;

  return Math.min(score, 1);
}

function detectContentful(html: string): number {
  let score = 0;

  // Contentful CDN (images/assets)
  if (html.includes('images.ctfassets.net') || html.includes('assets.ctfassets.net')) score += 0.5;

  // Contentful API calls in inline scripts
  if (html.includes('cdn.contentful.com') || html.includes('contentful')) score += 0.2;

  return Math.min(score, 1);
}

function detectShopify($: cheerio.CheerioAPI, html: string): number {
  let score = 0;

  // Shopify CDN
  if (html.includes('cdn.shopify.com')) score += 0.5;

  // Checkout URL pattern
  if (html.includes('/checkout') && html.includes('shopify')) score += 0.2;

  // Meta global Shopify object
  if (html.includes('Shopify.shop') || html.includes('myshopify.com')) score += 0.3;

  // Shopify theme liquid markers
  if (html.includes('shopify-section') || $('script[src*="shopify"]').length > 0) score += 0.2;

  return Math.min(score, 1);
}
