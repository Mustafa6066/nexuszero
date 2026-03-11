/**
 * Salesforce Connector
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class SalesforceConnector extends BaseConnector {
  private instanceUrl = 'https://login.salesforce.com';

  constructor() {
    super('salesforce');
  }

  getBaseUrl(config?: Record<string, unknown>): string {
    const url = config?.instanceUrl as string | undefined;
    if (url) this.instanceUrl = url;
    return `${this.instanceUrl}/services/data/v59.0`;
  }

  /** Set the instance URL for all subsequent requests */
  setInstanceUrl(url: string): void {
    this.instanceUrl = url;
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request(`${this.instanceUrl}/services/data/v59.0/limits`, accessToken, {
        skipRateLimit: true,
      });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        scopesValid: true,
        apiVersion: 'v59.0',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        scopesValid: false,
        apiVersion: 'v59.0',
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  /** Run a SOQL query */
  async query(accessToken: string, soql: string) {
    const encoded = encodeURIComponent(soql);
    return this.request(`${this.instanceUrl}/services/data/v59.0/query?q=${encoded}`, accessToken);
  }

  /** Get object metadata */
  async describeObject(accessToken: string, objectName: string) {
    return this.request(`${this.instanceUrl}/services/data/v59.0/sobjects/${objectName}/describe`, accessToken);
  }

  /** Get API usage limits */
  async getLimits(accessToken: string) {
    return this.request(`${this.instanceUrl}/services/data/v59.0/limits`, accessToken);
  }

  protected override extractRateLimitInfo(headers: Record<string, string>) {
    // Salesforce uses Sforce-Limit-Info header
    const limitInfo = headers['sforce-limit-info'];
    if (limitInfo) {
      const match = limitInfo.match(/api-usage=(\d+)\/(\d+)/);
      if (match) {
        const used = parseInt(match[1]!, 10);
        const total = parseInt(match[2]!, 10);
        return {
          remaining: total - used,
          limit: total,
          resetsAt: new Date(Date.now() + 86400000), // Resets daily
          windowSizeSeconds: 86400,
        };
      }
    }
    return super.extractRateLimitInfo(headers);
  }
}
