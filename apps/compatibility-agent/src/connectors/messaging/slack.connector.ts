/**
 * Slack Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class SlackConnector extends BaseConnector {
  constructor() {
    super('slack');
  }

  getBaseUrl(): string {
    return 'https://slack.com/api';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const resp = await this.request<{ ok: boolean }>('/auth.test', accessToken, {
        method: 'POST',
        skipRateLimit: true,
      });
      return {
        healthy: resp.data.ok,
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

  /** Post a message to a channel */
  async postMessage(accessToken: string, channel: string, text: string, blocks?: unknown[]) {
    return this.request<{ ok: boolean; ts: string }>('/chat.postMessage', accessToken, {
      method: 'POST',
      body: { channel, text, blocks },
    });
  }

  /** List channels */
  async listChannels(accessToken: string, limit = 100) {
    return this.request(`/conversations.list?limit=${limit}&types=public_channel,private_channel`, accessToken);
  }

  /** Send a notification (used by health alerts) */
  async sendNotification(accessToken: string, channel: string, message: string) {
    return this.postMessage(accessToken, channel, message);
  }
}
