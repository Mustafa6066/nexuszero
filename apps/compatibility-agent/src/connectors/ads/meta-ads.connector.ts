/**
 * Meta Ads Connector (Facebook/Instagram Ads)
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class MetaAdsConnector extends BaseConnector {
  constructor() {
    super('meta_ads');
  }

  getBaseUrl(): string {
    return 'https://graph.facebook.com/v20.0';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/me?fields=id,name', accessToken, { skipRateLimit: true });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'v20.0',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'v20.0',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Get ad account insights */
  async getInsights(
    accessToken: string,
    adAccountId: string,
    params: {
      time_range: { since: string; until: string };
      fields: string[];
      breakdowns?: string[];
      level?: string;
    },
  ) {
    const query = new URLSearchParams({
      time_range: JSON.stringify(params.time_range),
      fields: params.fields.join(','),
      level: params.level ?? 'campaign',
    });
    if (params.breakdowns?.length) {
      query.set('breakdowns', params.breakdowns.join(','));
    }
    return this.request(`/act_${adAccountId}/insights?${query}`, accessToken);
  }

  /** Get campaigns list */
  async getCampaigns(
    accessToken: string,
    adAccountId: string,
    fields: string[] = ['id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget'],
  ) {
    const query = new URLSearchParams({ fields: fields.join(','), limit: '100' });
    return this.request(`/act_${adAccountId}/campaigns?${query}`, accessToken);
  }

  protected override extractRateLimitInfo(headers: Record<string, string>) {
    // Meta uses x-business-use-case-usage and x-app-usage headers
    const appUsage = headers['x-app-usage'];
    if (appUsage) {
      try {
        const usage = JSON.parse(appUsage) as { call_count: number; total_cputime: number; total_time: number };
        return {
          remaining: Math.max(0, 100 - usage.call_count),
          limit: 100,
          resetsAt: new Date(Date.now() + 60000),
          windowSizeSeconds: 60,
        };
      } catch {
        // ignore parse errors
      }
    }
    return super.extractRateLimitInfo(headers);
  }
}
