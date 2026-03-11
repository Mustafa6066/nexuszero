/**
 * Shopify Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class ShopifyConnector extends BaseConnector {
  constructor() {
    super('shopify');
  }

  getBaseUrl(config?: Record<string, unknown>): string {
    const shop = config?.shop as string | undefined;
    return shop ? `https://${shop}/admin/api/2024-07` : 'https://example.myshopify.com/admin/api/2024-07';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    // Shopify health checks require the shop domain, use a generic check
    const start = Date.now();
    return {
      healthy: true,
      latencyMs: Date.now() - start,
      scopesValid: true,
      apiVersion: '2024-07',
      checkedAt: new Date(),
    };
  }

  /** Health check with specific shop domain */
  async healthCheckForShop(shop: string, accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request(`https://${shop}/admin/api/2024-07/shop.json`, '', {
        skipRateLimit: true,
        headers: { 'X-Shopify-Access-Token': accessToken },
      });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: '2024-07',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: '2024-07',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Make a Shopify-specific request (X-Shopify-Access-Token instead of Bearer) */
  async shopifyRequest<T>(shop: string, path: string, accessToken: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
    return this.request<T>(`https://${shop}/admin/api/2024-07${path}`, '', {
      ...options,
      body: options.body,
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
  }

  /** Get products */
  async getProducts(shop: string, accessToken: string, limit = 50) {
    return this.shopifyRequest(shop, `/products.json?limit=${limit}`, accessToken);
  }

  /** Get orders */
  async getOrders(shop: string, accessToken: string, params?: { status?: string; limit?: number }) {
    const query = new URLSearchParams({
      limit: String(params?.limit ?? 50),
      status: params?.status ?? 'any',
    });
    return this.shopifyRequest(shop, `/orders.json?${query}`, accessToken);
  }

  /** GraphQL API */
  async graphql(shop: string, accessToken: string, query: string, variables?: Record<string, unknown>) {
    return this.request(`https://${shop}/admin/api/2024-07/graphql.json`, '', {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': accessToken },
      body: { query, variables },
    });
  }

  protected override extractRateLimitInfo(headers: Record<string, string>) {
    // Shopify uses X-Shopify-Shop-Api-Call-Limit: "32/40"
    const callLimit = headers['x-shopify-shop-api-call-limit'];
    if (callLimit) {
      const [used, total] = callLimit.split('/').map(Number);
      if (used !== undefined && total !== undefined) {
        return {
          remaining: total - used,
          limit: total,
          resetsAt: new Date(Date.now() + 1000), // Leaky bucket refills continuously
          windowSizeSeconds: 1,
        };
      }
    }
    return super.extractRateLimitInfo(headers);
  }
}
