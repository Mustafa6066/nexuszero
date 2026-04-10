/**
 * Instantly.ai Connector — cold email infrastructure.
 * Used by Outbound Agent for email warmup, campaign management, and deliverability.
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class InstantlyConnector extends BaseConnector {
  constructor() {
    super('instantly');
  }

  getBaseUrl(): string {
    return 'https://api.instantly.ai/api/v2';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/accounts', accessToken, { skipRateLimit: true });
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

  /** List email accounts */
  async listAccounts(accessToken: string, limit = 100) {
    return this.request(`/accounts?limit=${limit}`, accessToken);
  }

  /** Get account warmup status */
  async getWarmupStatus(accessToken: string, accountId: string) {
    return this.request(`/accounts/${accountId}/warmup`, accessToken);
  }

  /** List campaigns */
  async listCampaigns(accessToken: string, params?: { status?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    query.set('limit', String(params?.limit ?? 50));
    return this.request(`/campaigns?${query}`, accessToken);
  }

  /** Get campaign analytics */
  async getCampaignAnalytics(accessToken: string, campaignId: string) {
    return this.request(`/campaigns/${campaignId}/analytics`, accessToken);
  }

  /** Add leads to a campaign */
  async addLeadsToCampaign(accessToken: string, campaignId: string, leads: Array<{ email: string; firstName?: string; lastName?: string; variables?: Record<string, string> }>) {
    return this.request(`/campaigns/${campaignId}/leads`, accessToken, {
      method: 'POST',
      body: { leads },
    });
  }

  /** Get email deliverability analytics */
  async getDeliverabilityStats(accessToken: string) {
    return this.request('/analytics/deliverability', accessToken);
  }
}
