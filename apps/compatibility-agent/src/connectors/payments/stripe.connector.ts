/**
 * Stripe Connect Connector (for payment/revenue data)
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class StripeConnector extends BaseConnector {
  constructor() {
    super('stripe_connect');
  }

  getBaseUrl(): string {
    return 'https://api.stripe.com/v1';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/account', accessToken, { skipRateLimit: true });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: '2024-06-20',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: '2024-06-20',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Get balance */
  async getBalance(accessToken: string) {
    return this.request('/balance', accessToken);
  }

  /** List charges */
  async listCharges(accessToken: string, params?: { limit?: number; created?: { gte?: number; lte?: number } }) {
    const query = new URLSearchParams({ limit: String(params?.limit ?? 100) });
    if (params?.created?.gte) query.set('created[gte]', String(params.created.gte));
    if (params?.created?.lte) query.set('created[lte]', String(params.created.lte));
    return this.request(`/charges?${query}`, accessToken);
  }

  /** List customers */
  async listCustomers(accessToken: string, limit = 100) {
    return this.request(`/customers?limit=${limit}`, accessToken);
  }

  /** Get revenue summary via balance transactions */
  async listBalanceTransactions(
    accessToken: string,
    params?: { limit?: number; type?: string; created?: { gte?: number; lte?: number } },
  ) {
    const query = new URLSearchParams({ limit: String(params?.limit ?? 100) });
    if (params?.type) query.set('type', params.type);
    if (params?.created?.gte) query.set('created[gte]', String(params.created.gte));
    if (params?.created?.lte) query.set('created[lte]', String(params.created.lte));
    return this.request(`/balance_transactions?${query}`, accessToken);
  }
}
