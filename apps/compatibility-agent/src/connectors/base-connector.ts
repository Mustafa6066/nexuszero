/**
 * Base Connector — abstract class all platform connectors extend.
 * Provides circuit breaker, rate limiting, retry logic, and health check primitives.
 */

import type { Platform, HealthCheckResult, RateLimitInfo } from '@nexuszero/shared';
import { getConnectorConfig, type ConnectorConfig } from '../config/connector-config.js';

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreaker {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  nextAttempt: number;
}

export interface ConnectorRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  timeout?: number;
  skipRateLimit?: boolean;
}

export interface ConnectorResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
  latencyMs: number;
  rateLimitInfo?: RateLimitInfo;
}

export abstract class BaseConnector {
  readonly platform: Platform;
  protected config: ConnectorConfig;
  private circuit: CircuitBreaker;
  private requestTimestamps: number[] = [];

  constructor(platform: Platform) {
    this.platform = platform;
    this.config = getConnectorConfig(platform);
    this.circuit = {
      state: 'closed',
      failures: 0,
      lastFailure: 0,
      nextAttempt: 0,
    };
  }

  /** Platform-specific health check implementation */
  abstract healthCheck(accessToken: string): Promise<HealthCheckResult>;

  /** Get the base URL for this platform's API */
  abstract getBaseUrl(config?: Record<string, unknown>): string;

  /** Make an authenticated API request with all protections */
  async request<T = unknown>(
    path: string,
    accessToken: string,
    options: ConnectorRequestOptions = {},
  ): Promise<ConnectorResponse<T>> {
    this.checkCircuit();

    if (!options.skipRateLimit) {
      await this.enforceRateLimit();
    }

    const url = path.startsWith('http') ? path : `${this.getBaseUrl()}${path}`;
    const timeout = options.timeout ?? this.config.timeoutMs;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const start = Date.now();

        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers,
        };

        const fetchOptions: RequestInit = {
          method: options.method ?? 'GET',
          headers,
          signal: AbortSignal.timeout(timeout),
        };

        if (options.body && fetchOptions.method !== 'GET') {
          fetchOptions.body = typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body);
        }

        const response = await fetch(url, fetchOptions);
        const latencyMs = Date.now() - start;

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => { responseHeaders[k] = v; });

        const rateLimitInfo = this.extractRateLimitInfo(responseHeaders);

        if (response.status === 429) {
          const retryAfter = parseInt(responseHeaders['retry-after'] ?? '5', 10);
          if (attempt < this.config.maxRetries) {
            await this.delay(retryAfter * 1000);
            continue;
          }
          throw new Error(`Rate limited by ${this.platform} after ${this.config.maxRetries} retries`);
        }

        if (response.status >= 500 && attempt < this.config.maxRetries) {
          await this.delay(this.config.retryBaseDelayMs * Math.pow(2, attempt));
          continue;
        }

        if (!response.ok) {
          const raw = await response.text().catch(() => '');
          // Scrub potential credentials from the error body before storing/logging.
          // Patterns: Bearer tokens, basic-auth strings, API-key-like values.
          const sanitized = raw
            .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
            .replace(/"access_token"\s*:\s*"[^"]*"/gi, '"access_token":"[REDACTED]"')
            .replace(/"refresh_token"\s*:\s*"[^"]*"/gi, '"refresh_token":"[REDACTED]"')
            .replace(/"client_secret"\s*:\s*"[^"]*"/gi, '"client_secret":"[REDACTED]"')
            .slice(0, 500);
          throw new Error(`${this.platform} API error ${response.status}: ${sanitized}`);
        }

        this.onSuccess();

        const data = await response.json() as T;
        return { data, status: response.status, headers: responseHeaders, latencyMs, rateLimitInfo };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.name === 'TimeoutError' || lastError.name === 'AbortError') {
          if (attempt < this.config.maxRetries) {
            await this.delay(this.config.retryBaseDelayMs * Math.pow(2, attempt));
            continue;
          }
        }

        // Don't retry client errors (4xx) except 429
        if (lastError.message.includes('API error 4') && !lastError.message.includes('API error 429')) {
          this.onSuccess(); // Client errors don't indicate platform failure
          throw lastError;
        }

        if (attempt === this.config.maxRetries) {
          this.onFailure();
          throw lastError;
        }

        await this.delay(this.config.retryBaseDelayMs * Math.pow(2, attempt));
      }
    }

    this.onFailure();
    throw lastError ?? new Error(`${this.platform} request failed after retries`);
  }

  /** Check if circuit breaker allows the request */
  private checkCircuit(): void {
    if (this.circuit.state === 'open') {
      if (Date.now() >= this.circuit.nextAttempt) {
        this.circuit.state = 'half-open';
      } else {
        throw new Error(`Circuit open for ${this.platform} — retry after ${new Date(this.circuit.nextAttempt).toISOString()}`);
      }
    }
  }

  /** Record a successful request */
  private onSuccess(): void {
    this.circuit.failures = 0;
    this.circuit.state = 'closed';
  }

  /** Record a failed request */
  private onFailure(): void {
    this.circuit.failures++;
    this.circuit.lastFailure = Date.now();

    if (this.circuit.failures >= this.config.circuitBreakerThreshold) {
      this.circuit.state = 'open';
      this.circuit.nextAttempt = Date.now() + this.config.circuitBreakerResetMs;
    }
  }

  /** Enforce per-minute rate limit using a sliding window */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60000;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > windowStart);

    if (this.requestTimestamps.length >= this.config.maxRequestsPerMinute) {
      const oldestInWindow = this.requestTimestamps[0]!;
      const waitMs = oldestInWindow + 60000 - now;
      if (waitMs > 0) {
        await this.delay(waitMs);
      }
    }

    this.requestTimestamps.push(Date.now());
  }

  /** Extract rate limit info from response headers (override per platform) */
  protected extractRateLimitInfo(headers: Record<string, string>): RateLimitInfo | undefined {
    const remaining = headers['x-ratelimit-remaining'] ?? headers['x-rate-limit-remaining'];
    const limit = headers['x-ratelimit-limit'] ?? headers['x-rate-limit-limit'];
    const reset = headers['x-ratelimit-reset'] ?? headers['x-rate-limit-reset'];

    if (remaining === undefined) return undefined;

    return {
      remaining: parseInt(remaining, 10),
      limit: limit ? parseInt(limit, 10) : this.config.maxRequestsPerMinute,
      resetsAt: reset ? new Date(parseInt(reset, 10) * 1000) : new Date(Date.now() + 60000),
      windowSizeSeconds: 60,
    };
  }

  /** Get current circuit breaker state */
  getCircuitState(): CircuitState {
    return this.circuit.state;
  }

  /** Reset circuit breaker (used by healing module) */
  resetCircuit(): void {
    this.circuit = {
      state: 'closed',
      failures: 0,
      lastFailure: 0,
      nextAttempt: 0,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
