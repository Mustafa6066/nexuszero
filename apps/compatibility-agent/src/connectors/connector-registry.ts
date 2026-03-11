/**
 * Connector Registry — singleton factory for platform connectors.
 * Returns the appropriate connector instance for any supported platform.
 */

import type { Platform } from '@nexuszero/shared';
import { BaseConnector } from './base-connector.js';
import { GoogleAnalyticsConnector } from './analytics/google-analytics.connector.js';
import { MixpanelConnector } from './analytics/mixpanel.connector.js';
import { AmplitudeConnector } from './analytics/amplitude.connector.js';
import { GoogleAdsConnector } from './ads/google-ads.connector.js';
import { MetaAdsConnector } from './ads/meta-ads.connector.js';
import { LinkedInAdsConnector } from './ads/linkedin-ads.connector.js';
import { GoogleSearchConsoleConnector } from './seo/google-search-console.connector.js';
import { HubSpotConnector } from './crm/hubspot.connector.js';
import { SalesforceConnector } from './crm/salesforce.connector.js';
import { WordPressConnector } from './cms/wordpress.connector.js';
import { WebflowConnector } from './cms/webflow.connector.js';
import { ContentfulConnector } from './cms/contentful.connector.js';
import { ShopifyConnector } from './cms/shopify.connector.js';
import { SlackConnector } from './messaging/slack.connector.js';
import { SendGridConnector } from './messaging/sendgrid.connector.js';
import { StripeConnector } from './payments/stripe.connector.js';

/** Singleton instances of all connectors */
const connectors: Map<Platform, BaseConnector> = new Map();

function initConnectors(): void {
  if (connectors.size > 0) return;

  connectors.set('google_analytics', new GoogleAnalyticsConnector());
  connectors.set('google_ads', new GoogleAdsConnector());
  connectors.set('google_search_console', new GoogleSearchConsoleConnector());
  connectors.set('meta_ads', new MetaAdsConnector());
  connectors.set('linkedin_ads', new LinkedInAdsConnector());
  connectors.set('hubspot', new HubSpotConnector());
  connectors.set('salesforce', new SalesforceConnector());
  connectors.set('wordpress', new WordPressConnector());
  connectors.set('webflow', new WebflowConnector());
  connectors.set('contentful', new ContentfulConnector());
  connectors.set('shopify', new ShopifyConnector());
  connectors.set('mixpanel', new MixpanelConnector());
  connectors.set('amplitude', new AmplitudeConnector());
  connectors.set('slack', new SlackConnector());
  connectors.set('sendgrid', new SendGridConnector());
  connectors.set('stripe_connect', new StripeConnector());
}

/** Get the connector for a specific platform */
export function getConnector(platform: Platform): BaseConnector {
  initConnectors();
  const connector = connectors.get(platform);
  if (!connector) {
    throw new Error(`No connector registered for platform: ${platform}`);
  }
  return connector;
}

/** Get a typed connector */
export function getTypedConnector<T extends BaseConnector>(platform: Platform): T {
  return getConnector(platform) as T;
}

/** Get all registered connectors (for health sweeps) */
export function getAllConnectors(): Map<Platform, BaseConnector> {
  initConnectors();
  return connectors;
}

/** Check if a platform has a registered connector */
export function hasConnector(platform: Platform): boolean {
  initConnectors();
  return connectors.has(platform);
}

/** Register (or override) a connector for a specific platform */
export function registerConnector(platform: Platform, connector: BaseConnector): void {
  initConnectors();
  connectors.set(platform, connector);
}

// Re-export all connector classes
export { GoogleAnalyticsConnector } from './analytics/google-analytics.connector.js';
export { MixpanelConnector } from './analytics/mixpanel.connector.js';
export { AmplitudeConnector } from './analytics/amplitude.connector.js';
export { GoogleAdsConnector } from './ads/google-ads.connector.js';
export { MetaAdsConnector } from './ads/meta-ads.connector.js';
export { LinkedInAdsConnector } from './ads/linkedin-ads.connector.js';
export { GoogleSearchConsoleConnector } from './seo/google-search-console.connector.js';
export { HubSpotConnector } from './crm/hubspot.connector.js';
export { SalesforceConnector } from './crm/salesforce.connector.js';
export { WordPressConnector } from './cms/wordpress.connector.js';
export { WebflowConnector } from './cms/webflow.connector.js';
export { ContentfulConnector } from './cms/contentful.connector.js';
export { ShopifyConnector } from './cms/shopify.connector.js';
export { SlackConnector } from './messaging/slack.connector.js';
export { SendGridConnector } from './messaging/sendgrid.connector.js';
export { StripeConnector } from './payments/stripe.connector.js';
