/**
 * Google Search Console Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class GoogleSearchConsoleConnector extends BaseConnector {
  constructor() {
    super('google_search_console');
  }

  getBaseUrl(): string {
    return 'https://searchconsole.googleapis.com/webmasters/v3';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/sites', accessToken, { skipRateLimit: true });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'v3',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'v3',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Query search analytics */
  async querySearchAnalytics(
    accessToken: string,
    siteUrl: string,
    params: {
      startDate: string;
      endDate: string;
      dimensions?: string[];
      rowLimit?: number;
      type?: string;
    },
  ) {
    const encodedSite = encodeURIComponent(siteUrl);
    return this.request(`/sites/${encodedSite}/searchAnalytics/query`, accessToken, {
      method: 'POST',
      body: {
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions: params.dimensions ?? ['query', 'page'],
        rowLimit: params.rowLimit ?? 1000,
        type: params.type ?? 'web',
      },
    });
  }

  /** Get sitemaps */
  async getSitemaps(accessToken: string, siteUrl: string) {
    const encodedSite = encodeURIComponent(siteUrl);
    return this.request(`/sites/${encodedSite}/sitemaps`, accessToken);
  }

  /** Submit URL for indexing via Indexing API */
  async requestIndexing(accessToken: string, url: string) {
    return this.request('https://indexing.googleapis.com/v3/urlNotifications:publish', accessToken, {
      method: 'POST',
      body: { url, type: 'URL_UPDATED' },
    });
  }
}
