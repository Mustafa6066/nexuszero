/**
 * Apollo.io Connector — lead enrichment and prospecting.
 * Used by Outbound Agent for lead sourcing and verification.
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class ApolloConnector extends BaseConnector {
  constructor() {
    super('apollo');
  }

  getBaseUrl(): string {
    return 'https://api.apollo.io/api/v1';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/auth/health', accessToken, { skipRateLimit: true });
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

  /** Search people by criteria */
  async searchPeople(accessToken: string, params: {
    personTitles?: string[];
    personLocations?: string[];
    organizationDomains?: string[];
    organizationNumEmployees?: string[];
    page?: number;
    perPage?: number;
  }) {
    return this.request('/mixed_people/search', accessToken, {
      method: 'POST',
      body: {
        person_titles: params.personTitles,
        person_locations: params.personLocations,
        q_organization_domains: params.organizationDomains?.join('\n'),
        organization_num_employees_ranges: params.organizationNumEmployees,
        page: params.page ?? 1,
        per_page: params.perPage ?? 25,
      },
    });
  }

  /** Enrich a person by email */
  async enrichPerson(accessToken: string, email: string) {
    return this.request('/people/match', accessToken, {
      method: 'POST',
      body: { email, reveal_personal_emails: false },
    });
  }

  /** Enrich organization by domain */
  async enrichOrganization(accessToken: string, domain: string) {
    return this.request('/organizations/enrich', accessToken, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
    });
  }

  /** Get contact lists */
  async listContactLists(accessToken: string) {
    return this.request('/labels', accessToken);
  }
}
