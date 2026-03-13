export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Milliseconds to wait before transitioning from open → half-open */
  resetTimeoutMs: number;
  /** Number of probe requests allowed in half-open state before closing */
  halfOpenRequests?: number;
}

/**
 * Circuit breaker pattern implementation.
 * - Closed: requests pass through normally
 * - Open: requests fail immediately after consecutive failures exceed threshold
 * - Half-open: after reset timeout, allows limited requests to test recovery
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;

  constructor(optionsOrThreshold: CircuitBreakerOptions | number, resetTimeoutMs?: number) {
    if (typeof optionsOrThreshold === 'number') {
      this.failureThreshold = optionsOrThreshold;
      this.resetTimeoutMs = resetTimeoutMs ?? 30000;
      this.halfOpenMaxAttempts = 3;
    } else {
      this.failureThreshold = optionsOrThreshold.failureThreshold;
      this.resetTimeoutMs = optionsOrThreshold.resetTimeoutMs;
      this.halfOpenMaxAttempts = optionsOrThreshold.halfOpenRequests ?? 3;
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'half-open';
        this.halfOpenAttempts = 0;
        this.successes = 0;
      } else {
        throw new CircuitBreakerOpenError();
      }
    }

    if (this.state === 'half-open' && this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
      throw new CircuitBreakerOpenError('Half-open attempt limit reached');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.halfOpenMaxAttempts) {
        this.reset();
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.halfOpenAttempts = 0;
      this.successes = 0;
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.halfOpenAttempts = 0;
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }
}
