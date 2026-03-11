/** Per-platform default configuration */

import type { Platform } from '@nexuszero/shared';

export interface ConnectorConfig {
  /** Maximum requests per minute to this platform */
  maxRequestsPerMinute: number;
  /** Connection timeout in ms */
  timeoutMs: number;
  /** Max consecutive failures before circuit opens */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset timeout in ms */
  circuitBreakerResetMs: number;
  /** Max retries per request */
  maxRetries: number;
  /** Base backoff delay in ms for retries */
  retryBaseDelayMs: number;
}

export const DEFAULT_CONNECTOR_CONFIGS: Record<Platform, ConnectorConfig> = {
  google_analytics: {
    maxRequestsPerMinute: 120,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 1000,
  },
  google_ads: {
    maxRequestsPerMinute: 60,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 2000,
  },
  google_search_console: {
    maxRequestsPerMinute: 200,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 1000,
  },
  meta_ads: {
    maxRequestsPerMinute: 200,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 120000,
    maxRetries: 3,
    retryBaseDelayMs: 2000,
  },
  linkedin_ads: {
    maxRequestsPerMinute: 80,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 2000,
  },
  hubspot: {
    maxRequestsPerMinute: 100,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 1500,
  },
  salesforce: {
    maxRequestsPerMinute: 100,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 2000,
  },
  wordpress: {
    maxRequestsPerMinute: 60,
    timeoutMs: 15000,
    circuitBreakerThreshold: 3,
    circuitBreakerResetMs: 30000,
    maxRetries: 2,
    retryBaseDelayMs: 1000,
  },
  webflow: {
    maxRequestsPerMinute: 60,
    timeoutMs: 15000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 1000,
  },
  contentful: {
    maxRequestsPerMinute: 78,
    timeoutMs: 15000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 1000,
  },
  shopify: {
    maxRequestsPerMinute: 40,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 2000,
  },
  mixpanel: {
    maxRequestsPerMinute: 60,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 1000,
  },
  amplitude: {
    maxRequestsPerMinute: 60,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 1000,
  },
  slack: {
    maxRequestsPerMinute: 50,
    timeoutMs: 10000,
    circuitBreakerThreshold: 3,
    circuitBreakerResetMs: 30000,
    maxRetries: 2,
    retryBaseDelayMs: 1000,
  },
  sendgrid: {
    maxRequestsPerMinute: 100,
    timeoutMs: 15000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 1000,
  },
  stripe_connect: {
    maxRequestsPerMinute: 100,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3,
    retryBaseDelayMs: 2000,
  },
};

export function getConnectorConfig(platform: Platform): ConnectorConfig {
  const config = DEFAULT_CONNECTOR_CONFIGS[platform];
  if (!config) {
    throw new Error(`No connector config found for platform: ${platform}`);
  }
  return config;
}
