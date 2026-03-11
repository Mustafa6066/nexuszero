/**
 * SendGrid Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class SendGridConnector extends BaseConnector {
  constructor() {
    super('sendgrid');
  }

  getBaseUrl(): string {
    return 'https://api.sendgrid.com/v3';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/scopes', accessToken, { skipRateLimit: true });
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

  /** Get email stats */
  async getStats(
    accessToken: string,
    params: { start_date: string; end_date?: string; aggregated_by?: string },
  ) {
    const query = new URLSearchParams({ start_date: params.start_date });
    if (params.end_date) query.set('end_date', params.end_date);
    if (params.aggregated_by) query.set('aggregated_by', params.aggregated_by);
    return this.request(`/stats?${query}`, accessToken);
  }

  /** Get marketing contacts count */
  async getContactsCount(accessToken: string) {
    return this.request('/marketing/contacts/count', accessToken);
  }
}
