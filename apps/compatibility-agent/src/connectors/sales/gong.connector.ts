/**
 * Gong Connector — call intelligence and conversation analytics.
 * Used by Sales Pipeline Agent (call-analyzer) for transcript retrieval.
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class GongConnector extends BaseConnector {
  constructor() {
    super('gong');
  }

  getBaseUrl(): string {
    return 'https://us-11211.api.gong.io/v2';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/settings', accessToken, { skipRateLimit: true });
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

  /** List calls within a date range */
  async listCalls(accessToken: string, params: { fromDateTime: string; toDateTime: string; cursor?: string }) {
    return this.request('/calls', accessToken, {
      method: 'POST',
      body: {
        filter: {
          fromDateTime: params.fromDateTime,
          toDateTime: params.toDateTime,
        },
        cursor: params.cursor,
      },
    });
  }

  /** Get call transcript */
  async getCallTranscript(accessToken: string, callId: string) {
    return this.request('/calls/transcript', accessToken, {
      method: 'POST',
      body: { filter: { callIds: [callId] } },
    });
  }

  /** Get call stats (talk ratio, interactivity, etc.) */
  async getCallStats(accessToken: string, callIds: string[]) {
    return this.request('/stats/activity/detailed', accessToken, {
      method: 'POST',
      body: { filter: { callIds } },
    });
  }

  /** List users (reps) */
  async listUsers(accessToken: string, cursor?: string) {
    return this.request(`/users${cursor ? `?cursor=${cursor}` : ''}`, accessToken);
  }
}
