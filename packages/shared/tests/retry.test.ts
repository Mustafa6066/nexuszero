import { describe, it, expect, vi } from 'vitest';
import { retry } from '../src/utils/retry';

describe('retry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { maxRetries: 3, baseDelayMs: 1, jitter: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on failure and succeeds eventually', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('success');

    const result = await retry(fn, { maxRetries: 3, baseDelayMs: 1, jitter: 0 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(retry(fn, { maxRetries: 2, baseDelayMs: 1, jitter: 0 })).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('respects isRetryable predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));
    await expect(
      retry(fn, {
        maxRetries: 5,
        baseDelayMs: 1,
        jitter: 0,
        isRetryable: () => false,
      })
    ).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('calls onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    await retry(fn, { maxRetries: 3, baseDelayMs: 1, jitter: 0, onRetry });
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });
});
