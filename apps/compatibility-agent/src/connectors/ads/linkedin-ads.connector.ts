/**
 * LinkedIn Ads Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class LinkedInAdsConnector extends BaseConnector {
  constructor() {
    super('linkedin_ads');
  }

  getBaseUrl(): string {
    return 'https://api.linkedin.com/rest';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('https://api.linkedin.com/v2/userinfo', accessToken, {
        skipRateLimit: true,
      });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: '202401',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: '202401',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Get ad analytics */
  async getAnalytics(
    accessToken: string,
    accountId: string,
    params: {
      dateRange: { start: string; end: string };
      pivot?: string;
      timeGranularity?: string;
    },
  ) {
    const query = new URLSearchParams({
      q: 'analytics',
      pivot: params.pivot ?? 'CAMPAIGN',
      dateRange: JSON.stringify({
        start: { year: params.dateRange.start.split('-')[0], month: params.dateRange.start.split('-')[1], day: params.dateRange.start.split('-')[2] },
        end: { year: params.dateRange.end.split('-')[0], month: params.dateRange.end.split('-')[1], day: params.dateRange.end.split('-')[2] },
      }),
      timeGranularity: params.timeGranularity ?? 'DAILY',
      accounts: `urn:li:sponsoredAccount:${accountId}`,
    });
    return this.request(`/adAnalytics?${query}`, accessToken, {
      headers: { 'LinkedIn-Version': '202401', 'X-Restli-Protocol-Version': '2.0.0' },
    });
  }

  /** Get campaigns */
  async getCampaigns(accessToken: string, accountId: string) {
    return this.request(
      `/adCampaigns?q=search&search=(account:(values:List(urn:li:sponsoredAccount:${accountId})))&count=100`,
      accessToken,
      { headers: { 'LinkedIn-Version': '202401', 'X-Restli-Protocol-Version': '2.0.0' } },
    );
  }
}
