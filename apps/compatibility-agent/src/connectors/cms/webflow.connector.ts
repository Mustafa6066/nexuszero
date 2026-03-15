/**
 * Webflow Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class WebflowConnector extends BaseConnector {
  constructor() {
    super('webflow');
  }

  getBaseUrl(): string {
    return 'https://api.webflow.com/v2';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/token/authorized_by', accessToken, { skipRateLimit: true });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'v2',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'v2',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Get sites */
  async getSites(accessToken: string) {
    return this.request<{ sites: Array<Record<string, unknown>> }>('/sites', accessToken);
  }

  /** Get pages for a site */
  async getPages(accessToken: string, siteId: string, limit = 100) {
    return this.request(`/sites/${siteId}/pages?limit=${limit}`, accessToken);
  }

  /** Get collections for a site */
  async getCollections(accessToken: string, siteId: string) {
    return this.request(`/sites/${siteId}/collections`, accessToken);
  }

  /** Get collection items */
  async getCollectionItems(accessToken: string, collectionId: string, limit = 100, offset = 0) {
    return this.request(`/collections/${collectionId}/items?limit=${limit}&offset=${offset}`, accessToken);
  }

  /** Publish site */
  async publishSite(accessToken: string, siteId: string, domains?: string[]) {
    return this.request(`/sites/${siteId}/publish`, accessToken, {
      method: 'POST',
      body: domains ? { customDomains: domains } : {},
    });
  }

  /** Add custom code to site (for tracking scripts) */
  async registerScript(
    accessToken: string,
    siteId: string,
    script: { sourceCode: string; version: string; displayName: string },
  ) {
    return this.request(`/sites/${siteId}/registered_scripts/inline`, accessToken, {
      method: 'POST',
      body: script,
    });
  }

  /** Update a page's SEO settings and open graph data */
  async updatePage(
    accessToken: string,
    pageId: string,
    data: { title?: string; description?: string; slug?: string; openGraph?: Record<string, unknown> },
  ) {
    return this.request(`/pages/${pageId}`, accessToken, {
      method: 'PATCH',
      body: data,
    });
  }

  /** Update a collection item (e.g., blog post, product) */
  async updateCollectionItem(
    accessToken: string,
    collectionId: string,
    itemId: string,
    data: { fieldData: Record<string, unknown>; isArchived?: boolean; isDraft?: boolean },
  ) {
    return this.request(`/collections/${collectionId}/items/${itemId}`, accessToken, {
      method: 'PATCH',
      body: data,
    });
  }

  /** Add custom code to specific page head */
  async addCustomCode(
    accessToken: string,
    pageId: string,
    code: { headCode?: string; footerCode?: string },
  ) {
    return this.request(`/pages/${pageId}/custom_code`, accessToken, {
      method: 'PUT',
      body: {
        scripts: {
          ...(code.headCode ? { head: code.headCode } : {}),
          ...(code.footerCode ? { footer: code.footerCode } : {}),
        },
      },
    });
  }
}
