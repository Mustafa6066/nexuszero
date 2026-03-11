/**
 * Google Ads Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';
import { env } from '../../config/env.js';

export class GoogleAdsConnector extends BaseConnector {
  constructor() {
    super('google_ads');
  }

  getBaseUrl(): string {
    return 'https://googleads.googleapis.com/v17';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/customers:listAccessibleCustomers', accessToken, {
        skipRateLimit: true,
        headers: { 'developer-token': env.googleAdsDevToken },
      });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'v17',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'v17',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Run a GAQL query */
  async query(
    accessToken: string,
    customerId: string,
    gaqlQuery: string,
  ) {
    return this.request(`/customers/${customerId}/googleAds:searchStream`, accessToken, {
      method: 'POST',
      body: { query: gaqlQuery },
      headers: { 'developer-token': env.googleAdsDevToken },
    });
  }

  /** Get campaign performance */
  async getCampaignPerformance(
    accessToken: string,
    customerId: string,
    dateRange: { startDate: string; endDate: string },
  ) {
    const gaql = `
      SELECT campaign.id, campaign.name, campaign.status,
             metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'
      ORDER BY metrics.cost_micros DESC`;
    return this.query(accessToken, customerId, gaql);
  }
}
