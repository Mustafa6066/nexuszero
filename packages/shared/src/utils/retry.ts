export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Jitter factor (0-1). Adds random jitter to delay to prevent thundering herd */
  jitter: number;
  /** Predicate to decide if error is retryable. Default: all errors are retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: 0.1,
};

/**
 * Retry a function with exponential backoff and jitter.
 * Throws the last error if all retries are exhausted.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries) break;
      if (opts.isRetryable && !opts.isRetryable(error)) break;

      const exponentialDelay = opts.baseDelayMs * Math.pow(2, attempt);
      const jitterAmount = exponentialDelay * opts.jitter * Math.random();
      const delay = Math.min(exponentialDelay + jitterAmount, opts.maxDelayMs);

      opts.onRetry?.(error, attempt + 1, delay);

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
