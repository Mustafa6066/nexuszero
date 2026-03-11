/**
 * Contentful Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class ContentfulConnector extends BaseConnector {
  constructor() {
    super('contentful');
  }

  getBaseUrl(): string {
    return 'https://api.contentful.com';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/spaces', accessToken, { skipRateLimit: true });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'v1',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'v1',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Get content types (content models) */
  async getContentTypes(accessToken: string, spaceId: string, environmentId = 'master') {
    return this.request(`/spaces/${spaceId}/environments/${environmentId}/content_types`, accessToken);
  }

  /** Get entries */
  async getEntries(
    accessToken: string,
    spaceId: string,
    params?: { content_type?: string; limit?: number; skip?: number; environmentId?: string },
  ) {
    const envId = params?.environmentId ?? 'master';
    const query = new URLSearchParams();
    if (params?.content_type) query.set('content_type', params.content_type);
    query.set('limit', String(params?.limit ?? 100));
    if (params?.skip) query.set('skip', String(params.skip));
    return this.request(
      `/spaces/${spaceId}/environments/${envId}/entries?${query}`,
      accessToken,
    );
  }

  /** Get single entry */
  async getEntry(accessToken: string, spaceId: string, entryId: string, environmentId = 'master') {
    return this.request(
      `/spaces/${spaceId}/environments/${environmentId}/entries/${entryId}`,
      accessToken,
    );
  }

  /** Get assets */
  async getAssets(accessToken: string, spaceId: string, limit = 100, environmentId = 'master') {
    return this.request(
      `/spaces/${spaceId}/environments/${environmentId}/assets?limit=${limit}`,
      accessToken,
    );
  }

  protected override extractRateLimitInfo(headers: Record<string, string>) {
    // Contentful uses X-Contentful-RateLimit-Second-Remaining
    const secondRemaining = headers['x-contentful-ratelimit-second-remaining'];
    if (secondRemaining !== undefined) {
      return {
        remaining: parseInt(secondRemaining, 10),
        limit: 10,
        resetsAt: new Date(Date.now() + 1000),
        windowSizeSeconds: 1,
      };
    }
    return super.extractRateLimitInfo(headers);
  }
}
