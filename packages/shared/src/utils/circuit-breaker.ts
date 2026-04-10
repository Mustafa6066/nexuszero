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
  /** Number of successes in half-open state required to close the circuit */
  successThreshold?: number;
  /** Called when the circuit state changes */
  onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState) => void;
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
  private readonly successThreshold: number;
  private readonly onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState) => void;

  constructor(optionsOrThreshold: CircuitBreakerOptions | number, resetTimeoutMs?: number) {
    if (typeof optionsOrThreshold === 'number') {
      this.failureThreshold = optionsOrThreshold;
      this.resetTimeoutMs = resetTimeoutMs ?? 30000;
      this.halfOpenMaxAttempts = 3;
      this.successThreshold = 3;
    } else {
      this.failureThreshold = optionsOrThreshold.failureThreshold;
      this.resetTimeoutMs = optionsOrThreshold.resetTimeoutMs;
      this.halfOpenMaxAttempts = optionsOrThreshold.halfOpenRequests ?? 3;
      this.successThreshold = optionsOrThreshold.successThreshold ?? optionsOrThreshold.halfOpenRequests ?? 3;
      this.onStateChange = optionsOrThreshold.onStateChange;
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.transitionTo('half-open');
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
      if (this.successes >= this.successThreshold) {
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
      this.transitionTo('open');
      this.halfOpenAttempts = 0;
      this.successes = 0;
    } else if (this.failures >= this.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    if (oldState === newState) return;
    this.state = newState;
    this.onStateChange?.(oldState, newState);
  }

  reset(): void {
    this.transitionTo('closed');
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

  toJSON(): { state: CircuitBreakerState; failures: number; successes: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
