/**
 * Mixpanel Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class MixpanelConnector extends BaseConnector {
  constructor() {
    super('mixpanel');
  }

  getBaseUrl(): string {
    return 'https://mixpanel.com/api/2.0';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/engage', accessToken, {
        method: 'GET',
        skipRateLimit: true,
        headers: { Accept: 'application/json' },
      });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'v2.0',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'v2.0',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Query events */
  async queryEvents(
    accessToken: string,
    params: { event: string; from_date: string; to_date: string; unit?: string },
  ) {
    const query = new URLSearchParams({
      event: JSON.stringify([params.event]),
      from_date: params.from_date,
      to_date: params.to_date,
      unit: params.unit ?? 'day',
    });
    return this.request(`/events?${query}`, accessToken);
  }
}
