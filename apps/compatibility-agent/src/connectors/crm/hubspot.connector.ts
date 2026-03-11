/**
 * HubSpot Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class HubSpotConnector extends BaseConnector {
  constructor() {
    super('hubspot');
  }

  getBaseUrl(): string {
    return 'https://api.hubapi.com';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/account-info/v3/details', accessToken, { skipRateLimit: true });
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

  /** Search contacts */
  async searchContacts(
    accessToken: string,
    params: {
      filterGroups: Array<{ filters: Array<{ propertyName: string; operator: string; value: string }> }>;
      properties?: string[];
      limit?: number;
      after?: string;
    },
  ) {
    return this.request('/crm/v3/objects/contacts/search', accessToken, {
      method: 'POST',
      body: {
        filterGroups: params.filterGroups,
        properties: params.properties ?? ['email', 'firstname', 'lastname', 'company'],
        limit: params.limit ?? 100,
        after: params.after,
      },
    });
  }

  /** Get deals pipeline */
  async getDeals(accessToken: string, limit = 100, after?: string) {
    const query = new URLSearchParams({
      limit: String(limit),
      properties: 'dealname,amount,dealstage,closedate,pipeline',
    });
    if (after) query.set('after', after);
    return this.request(`/crm/v3/objects/deals?${query}`, accessToken);
  }

  /** Get companies */
  async getCompanies(accessToken: string, limit = 100, after?: string) {
    const query = new URLSearchParams({
      limit: String(limit),
      properties: 'name,domain,industry,numberofemployees',
    });
    if (after) query.set('after', after);
    return this.request(`/crm/v3/objects/companies?${query}`, accessToken);
  }

  protected override extractRateLimitInfo(headers: Record<string, string>) {
    // HubSpot uses X-HubSpot-RateLimit-Daily-Remaining, etc.
    const daily = headers['x-hubspot-ratelimit-daily-remaining'];
    const secondly = headers['x-hubspot-ratelimit-secondly-remaining'];
    if (secondly !== undefined) {
      return {
        remaining: parseInt(secondly, 10),
        limit: 10,
        resetsAt: new Date(Date.now() + 1000),
        windowSizeSeconds: 1,
      };
    }
    if (daily !== undefined) {
      return {
        remaining: parseInt(daily, 10),
        limit: 250000,
        resetsAt: new Date(Date.now() + 86400000),
        windowSizeSeconds: 86400,
      };
    }
    return super.extractRateLimitInfo(headers);
  }
}
