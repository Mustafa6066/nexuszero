/**
 * WordPress Connector (supports both .com and self-hosted)
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class WordPressConnector extends BaseConnector {
  constructor() {
    super('wordpress');
  }

  getBaseUrl(config?: Record<string, unknown>): string {
    const selfHosted = config?.selfHosted as boolean | undefined;
    const siteUrl = config?.siteUrl as string | undefined;
    if (selfHosted && siteUrl) {
      return `${siteUrl}/wp-json`;
    }
    return 'https://public-api.wordpress.com/wp/v2';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // Try the WP REST API base endpoint
      await this.request('https://public-api.wordpress.com/rest/v1.1/me', accessToken, {
        skipRateLimit: true,
      });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'wp/v2',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'wp/v2',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Health check for self-hosted WordPress */
  async healthCheckSelfHosted(
    siteUrl: string,
    username: string,
    password: string,
  ): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
      await this.request(`${siteUrl}/wp-json/wp/v2/posts?per_page=1`, '', {
        skipRateLimit: true,
        headers: { Authorization: `Basic ${basicAuth}` },
      });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'wp/v2',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'wp/v2',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Get posts */
  async getPosts(
    accessToken: string,
    siteId: string,
    params?: { per_page?: number; page?: number; status?: string },
  ) {
    const query = new URLSearchParams({
      per_page: String(params?.per_page ?? 20),
      page: String(params?.page ?? 1),
    });
    if (params?.status) query.set('status', params.status);
    return this.request(
      `https://public-api.wordpress.com/wp/v2/sites/${siteId}/posts?${query}`,
      accessToken,
    );
  }

  /** Get pages */
  async getPages(accessToken: string, siteId: string, params?: { per_page?: number }) {
    const query = new URLSearchParams({ per_page: String(params?.per_page ?? 20) });
    return this.request(
      `https://public-api.wordpress.com/wp/v2/sites/${siteId}/pages?${query}`,
      accessToken,
    );
  }

  /** Update a post */
  async updatePost(
    accessToken: string,
    siteId: string,
    postId: string,
    data: { title?: string; content?: string; excerpt?: string; meta?: Record<string, unknown> },
  ) {
    return this.request(
      `https://public-api.wordpress.com/wp/v2/sites/${siteId}/posts/${postId}`,
      accessToken,
      { method: 'POST', body: data },
    );
  }

  /** Update a page */
  async updatePage(
    accessToken: string,
    siteId: string,
    pageId: string,
    data: { title?: string; content?: string; excerpt?: string; meta?: Record<string, unknown> },
  ) {
    return this.request(
      `https://public-api.wordpress.com/wp/v2/sites/${siteId}/pages/${pageId}`,
      accessToken,
      { method: 'POST', body: data },
    );
  }

  /** Inject a script into the site head (via custom HTML widget or head injection plugin) */
  async injectHeadScript(
    accessToken: string,
    siteId: string,
    script: string,
  ) {
    // Uses the WP.com custom CSS/head endpoint for .com sites
    // For self-hosted, this would use the wp_head action via REST API
    return this.request(
      `https://public-api.wordpress.com/wp/v2/sites/${siteId}/settings`,
      accessToken,
      {
        method: 'POST',
        body: { head_tags: script },
      },
    );
  }
}
