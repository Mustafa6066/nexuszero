/**
 * Dynamic Connector — A connector that can work with ANY REST API
 * based on an LLM-generated PlatformBlueprint. This is the execution arm
 * of the universal onboarding agent.
 *
 * Unlike the 16 hardcoded connectors, the DynamicConnector is configured
 * at runtime using a PlatformBlueprint, allowing it to connect to platforms
 * that NexusZero has never seen before.
 */

import type { HealthCheckResult, RateLimitInfo } from '@nexuszero/shared';
import type { PlatformBlueprint, EndpointBlueprint } from '../../intelligence/platform-analyzer.js';

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreaker {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  nextAttempt: number;
}

export interface DynamicRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  timeout?: number;
  queryParams?: Record<string, string>;
}

export interface DynamicResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
  latencyMs: number;
  rateLimitInfo?: RateLimitInfo;
}

export class DynamicConnector {
  readonly blueprint: PlatformBlueprint;
  private circuit: CircuitBreaker;
  private requestTimestamps: number[] = [];
  private readonly maxRetries = 3;
  private readonly retryBaseDelayMs = 1000;

  constructor(blueprint: PlatformBlueprint) {
    this.blueprint = blueprint;
    this.circuit = {
      state: 'closed',
      failures: 0,
      lastFailure: 0,
      nextAttempt: 0,
    };
  }

  /** Perform a health check using the blueprint's health endpoint */
  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const ep = this.blueprint.healthCheckEndpoint;
      const resp = await this.request(ep.path, accessToken, { method: ep.method, timeout: 10000 });
      return {
        healthy: resp.status >= 200 && resp.status < 300,
        latencyMs: Date.now() - start,
        checkedAt: new Date(),
        scopesValid: true,
        apiVersion: this.blueprint.apiVersion ?? 'unknown',
        metadata: { platformId: this.blueprint.platformId },
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        checkedAt: new Date(),
        scopesValid: false,
        apiVersion: this.blueprint.apiVersion ?? 'unknown',
        error: error instanceof Error ? error.message : String(error),
        metadata: { platformId: this.blueprint.platformId },
      };
    }
  }

  /** Fetch data from a named endpoint in the blueprint */
  async fetchEndpoint<T = unknown>(
    endpointName: string,
    accessToken: string,
    options?: DynamicRequestOptions,
  ): Promise<DynamicResponse<T>> {
    const ep = this.blueprint.dataEndpoints.find((e: EndpointBlueprint) => e.name === endpointName);
    if (!ep) {
      throw new Error(`Endpoint "${endpointName}" not found in blueprint for ${this.blueprint.platformName}`);
    }
    return this.request<T>(ep.path, accessToken, { method: ep.method, ...options });
  }

  /** List available endpoints from the blueprint */
  getAvailableEndpoints(): EndpointBlueprint[] {
    return [...this.blueprint.dataEndpoints];
  }

  /** Make an authenticated API request with circuit breaker, rate limiting, and retry */
  async request<T = unknown>(
    path: string,
    accessToken: string,
    options: DynamicRequestOptions = {},
  ): Promise<DynamicResponse<T>> {
    this.checkCircuit();
    await this.enforceRateLimit();

    const url = this.buildUrl(path, options.queryParams);
    const timeout = options.timeout ?? 30000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const start = Date.now();
        const headers = this.buildHeaders(accessToken, options.headers);

        const fetchOptions: RequestInit = {
          method: options.method ?? 'GET',
          headers,
          signal: AbortSignal.timeout(timeout),
        };

        if (options.body && fetchOptions.method !== 'GET') {
          fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        }

        const response = await fetch(url, fetchOptions);
        const latencyMs = Date.now() - start;

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => { responseHeaders[k] = v; });

        const rateLimitInfo = this.extractRateLimitInfo(responseHeaders);

        if (response.status === 429) {
          const retryAfter = parseInt(responseHeaders['retry-after'] ?? '5', 10);
          if (attempt < this.maxRetries) {
            await this.delay(retryAfter * 1000);
            continue;
          }
          throw new Error(`Rate limited by ${this.blueprint.platformName} after retries`);
        }

        if (response.status >= 500 && attempt < this.maxRetries) {
          await this.delay(this.retryBaseDelayMs * Math.pow(2, attempt));
          continue;
        }

        if (!response.ok) {
          const raw = await response.text().catch(() => '');
          const sanitized = raw
            .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
            .replace(/"access_token"\s*:\s*"[^"]*"/gi, '"access_token":"[REDACTED]"')
            .replace(/"refresh_token"\s*:\s*"[^"]*"/gi, '"refresh_token":"[REDACTED]"')
            .replace(/"client_secret"\s*:\s*"[^"]*"/gi, '"client_secret":"[REDACTED]"')
            .replace(/"api_key"\s*:\s*"[^"]*"/gi, '"api_key":"[REDACTED]"')
            .slice(0, 500);
          throw new Error(`${this.blueprint.platformName} API error ${response.status}: ${sanitized}`);
        }

        this.onSuccess();

        const data = await response.json() as T;
        return { data, status: response.status, headers: responseHeaders, latencyMs, rateLimitInfo };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.name === 'TimeoutError' || lastError.name === 'AbortError') {
          if (attempt < this.maxRetries) {
            await this.delay(this.retryBaseDelayMs * Math.pow(2, attempt));
            continue;
          }
        }

        // Don't retry 4xx (except 429)
        if (lastError.message.includes('API error 4') && !lastError.message.includes('API error 429')) {
          this.onSuccess();
          throw lastError;
        }

        if (attempt === this.maxRetries) {
          this.onFailure();
          throw lastError;
        }

        await this.delay(this.retryBaseDelayMs * Math.pow(2, attempt));
      }
    }

    this.onFailure();
    throw lastError ?? new Error(`${this.blueprint.platformName} request failed after retries`);
  }

  /** Validate provided credentials by performing a health check */
  async validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }> {
    const token = credentials.accessToken ?? credentials.apiKey ?? credentials.token ?? credentials.key ?? '';
    if (!token) {
      return { valid: false, error: 'No credentials provided' };
    }

    try {
      const result = await this.healthCheck(token);
      return { valid: result.healthy, error: result.error };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // ── Internal mechanics ────────────────────────────────────────────────────

  private buildUrl(path: string, queryParams?: Record<string, string>): string {
    const base = path.startsWith('http') ? path : `${this.blueprint.baseUrl}${path}`;
    if (!queryParams) return base;
    const url = new URL(base);
    for (const [k, v] of Object.entries(queryParams)) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  }

  private buildHeaders(accessToken: string, extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };

    const bp = this.blueprint;

    switch (bp.authMethod) {
      case 'oauth2':
      case 'oauth2_pkce':
      case 'bearer_token':
        headers['Authorization'] = `Bearer ${accessToken}`;
        break;
      case 'api_key':
        if (bp.apiKey) {
          const prefix = bp.apiKey.headerPrefix ? `${bp.apiKey.headerPrefix} ` : '';
          headers[bp.apiKey.headerName] = `${prefix}${accessToken}`;
        } else {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
        break;
      case 'basic_auth':
        headers['Authorization'] = `Basic ${Buffer.from(accessToken).toString('base64')}`;
        break;
      default:
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return headers;
  }

  private extractRateLimitInfo(headers: Record<string, string>): RateLimitInfo | undefined {
    const rl = this.blueprint.rateLimits;
    const remaining = rl.headerRemaining ? parseInt(headers[rl.headerRemaining] ?? '', 10) : NaN;
    const resetStr = rl.headerReset ? headers[rl.headerReset] : undefined;

    if (isNaN(remaining)) return undefined;

    let resetsAt: Date;
    if (resetStr) {
      const resetNum = parseInt(resetStr, 10);
      resetsAt = resetNum > 1e9 ? new Date(resetNum * 1000) : new Date(Date.now() + resetNum * 1000);
    } else {
      resetsAt = new Date(Date.now() + 60000);
    }

    return {
      remaining,
      limit: rl.requestsPerMinute,
      resetsAt,
    };
  }

  private checkCircuit(): void {
    if (this.circuit.state === 'open') {
      if (Date.now() >= this.circuit.nextAttempt) {
        this.circuit.state = 'half-open';
      } else {
        throw new Error(`Circuit open for ${this.blueprint.platformName} — retry after ${new Date(this.circuit.nextAttempt).toISOString()}`);
      }
    }
  }

  private onSuccess(): void {
    this.circuit.failures = 0;
    this.circuit.state = 'closed';
  }

  private onFailure(): void {
    this.circuit.failures++;
    this.circuit.lastFailure = Date.now();
    if (this.circuit.failures >= 5) {
      this.circuit.state = 'open';
      this.circuit.nextAttempt = Date.now() + 60000;
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60000;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > windowStart);
    const rpm = this.blueprint.rateLimits.requestsPerMinute;
    if (this.requestTimestamps.length >= rpm) {
      const oldest = this.requestTimestamps[0]!;
      const waitMs = oldest + 60000 - now;
      if (waitMs > 0) await this.delay(Math.min(waitMs, 10000));
    }
    this.requestTimestamps.push(now);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
