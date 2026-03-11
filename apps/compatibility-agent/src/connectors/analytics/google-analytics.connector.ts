/**
 * Google Analytics (GA4) Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class GoogleAnalyticsConnector extends BaseConnector {
  constructor() {
    super('google_analytics');
  }

  getBaseUrl(): string {
    return 'https://analyticsdata.googleapis.com/v1beta';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // List GA4 account summaries as a lightweight ping
      const resp = await this.request<{ accountSummaries?: unknown[] }>(
        'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
        accessToken,
        { skipRateLimit: true },
      );
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'v1beta',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'v1beta',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Run a GA4 report */
  async runReport(
    accessToken: string,
    propertyId: string,
    params: {
      dateRanges: Array<{ startDate: string; endDate: string }>;
      metrics: Array<{ name: string }>;
      dimensions?: Array<{ name: string }>;
      limit?: number;
    },
  ) {
    return this.request(`/properties/${propertyId}:runReport`, accessToken, {
      method: 'POST',
      body: {
        dateRanges: params.dateRanges,
        metrics: params.metrics,
        dimensions: params.dimensions ?? [],
        limit: params.limit ?? 10000,
      },
    });
  }

  /** Get realtime data */
  async getRealtimeReport(
    accessToken: string,
    propertyId: string,
    metrics: Array<{ name: string }>,
  ) {
    return this.request(`/properties/${propertyId}:runRealtimeReport`, accessToken, {
      method: 'POST',
      body: { metrics },
    });
  }
}
