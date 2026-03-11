/**
 * Amplitude Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class AmplitudeConnector extends BaseConnector {
  constructor() {
    super('amplitude');
  }

  getBaseUrl(): string {
    return 'https://amplitude.com/api/2';
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // For Amplitude, the "accessToken" is actually api_key:secret_key base64
      await this.request('/events/segmentation', accessToken, {
        method: 'GET',
        skipRateLimit: true,
      });
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

  /** Query event segmentation */
  async querySegmentation(
    accessToken: string,
    params: { e: string; start: string; end: string; m?: string },
  ) {
    const query = new URLSearchParams({
      e: JSON.stringify({ event_type: params.e }),
      start: params.start,
      end: params.end,
      m: params.m ?? 'uniques',
    });
    return this.request(`/events/segmentation?${query}`, accessToken);
  }
}
