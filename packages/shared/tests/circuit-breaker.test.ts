import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from '../src/utils/circuit-breaker';

describe('CircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = new CircuitBreaker(3, 1000);
    expect(cb.getState()).toBe('closed');
  });

  it('passes through when closed', async () => {
    const cb = new CircuitBreaker(3, 1000);
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe('closed');
  });

  it('opens after consecutive failures exceed threshold', async () => {
    const cb = new CircuitBreaker(3, 1000);
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe('open');
    await expect(cb.execute(() => Promise.resolve(1))).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('resets failure count on success', async () => {
    const cb = new CircuitBreaker(3, 1000);

    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb.getFailureCount()).toBe(2);

    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getFailureCount()).toBe(0);
    expect(cb.getState()).toBe('closed');
  });

  it('transitions to half-open after reset timeout', async () => {
    const cb = new CircuitBreaker(2, 50); // 50ms reset timeout
    const fail = () => Promise.reject(new Error('fail'));

    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    await new Promise((r) => setTimeout(r, 60));

    // Next call should transition to half-open and allow attempt
    const result = await cb.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
  });

  it('manual reset returns to closed', async () => {
    const cb = new CircuitBreaker(2, 10000);
    const fail = () => Promise.reject(new Error('fail'));

    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.getFailureCount()).toBe(0);
  });
});
