/**
 * CRM Detector — detects CRM platforms from HTML form integrations, chatbots, and tracking scripts.
 */

import type { TechStackDetection } from '@nexuszero/shared';

export function detectCrm(html: string, url: string): TechStackDetection[] {
  const detections: TechStackDetection[] = [];

  // HubSpot
  const hsScore = detectHubSpot(html);
  if (hsScore > 0) {
    detections.push({
      platform: 'hubspot',
      confidence: hsScore,
      detectedVia: 'html_analysis',
      evidence: 'HubSpot tracking code, forms, or chat widget',
    });
  }

  // Salesforce
  const sfScore = detectSalesforce(html);
  if (sfScore > 0) {
    detections.push({
      platform: 'salesforce',
      confidence: sfScore,
      detectedVia: 'html_analysis',
      evidence: 'Salesforce web-to-lead, Pardot, or chat',
    });
  }

  return detections;
}

function detectHubSpot(html: string): number {
  let score = 0;

  // HubSpot tracking script
  if (html.includes('js.hs-scripts.com') || html.includes('js.hsforms.net')) score += 0.6;

  // HubSpot forms
  if (html.includes('hbspt.forms.create') || html.includes('hs-form')) score += 0.3;

  // HubSpot chat
  if (html.includes('js.usemessages.com') || html.includes('hubspot-messages-iframe-container')) score += 0.2;

  // HubSpot analytics
  if (html.includes('hs-analytics') || html.includes('hubspot.com/__')) score += 0.15;

  return Math.min(score, 1);
}

function detectSalesforce(html: string): number {
  let score = 0;

  // Salesforce web-to-lead forms
  if (html.includes('webto.salesforce.com') || html.includes('web-to-lead')) score += 0.5;

  // Pardot (Salesforce Marketing)
  if (html.includes('pardot.com') || html.includes('pi.pardot.com')) score += 0.5;

  // Salesforce Chat (Embedded Service)
  if (html.includes('service.force.com') || html.includes('embeddedservice')) score += 0.3;

  // Salesforce Lightning Out
  if (html.includes('lightning.force.com')) score += 0.2;

  return Math.min(score, 1);
}
