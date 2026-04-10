/**
 * QuickBooks Online Connector — financial data for CFO briefings and cost analysis.
 * Used by Finance Agent for revenue, expense, and cash flow data.
 */

import type { HealthCheckResult } from '@nexuszero/shared';
import { BaseConnector } from '../base-connector.js';

export class QuickBooksConnector extends BaseConnector {
  private realmId = '';

  constructor() {
    super('quickbooks');
  }

  getBaseUrl(config?: Record<string, unknown>): string {
    const realm = config?.realmId ?? this.realmId;
    return `https://quickbooks.api.intuit.com/v3/company/${realm}`;
  }

  /** Set the company realm ID (required for all QBO requests) */
  setRealmId(realmId: string): void {
    this.realmId = realmId;
  }

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.request('/companyinfo/' + this.realmId, accessToken, {
        skipRateLimit: true,
        headers: { Accept: 'application/json' },
      });
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

  /** Query profit and loss report */
  async getProfitAndLoss(accessToken: string, params: {
    startDate: string;
    endDate: string;
    summarizeBy?: 'Total' | 'Month' | 'Week' | 'Days';
  }) {
    const query = new URLSearchParams({
      start_date: params.startDate,
      end_date: params.endDate,
    });
    if (params.summarizeBy) query.set('summarize_column_by', params.summarizeBy);
    return this.request(`/reports/ProfitAndLoss?${query}`, accessToken, {
      headers: { Accept: 'application/json' },
    });
  }

  /** Query balance sheet */
  async getBalanceSheet(accessToken: string, date: string) {
    return this.request(`/reports/BalanceSheet?date=${date}`, accessToken, {
      headers: { Accept: 'application/json' },
    });
  }

  /** Query cash flow statement */
  async getCashFlow(accessToken: string, params: { startDate: string; endDate: string }) {
    const query = new URLSearchParams({
      start_date: params.startDate,
      end_date: params.endDate,
    });
    return this.request(`/reports/CashFlow?${query}`, accessToken, {
      headers: { Accept: 'application/json' },
    });
  }

  /** List invoices */
  async queryInvoices(accessToken: string, queryStr: string) {
    return this.request(`/query?query=${encodeURIComponent(queryStr)}`, accessToken, {
      headers: { Accept: 'application/json' },
    });
  }

  /** List expenses */
  async queryExpenses(accessToken: string, queryStr: string) {
    return this.request(`/query?query=${encodeURIComponent(queryStr)}`, accessToken, {
      headers: { Accept: 'application/json' },
    });
  }
}
