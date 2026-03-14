import { CircuitBreaker, CircuitBreakerOpenError } from '@nexuszero/shared';
import { describe, expect, it, vi } from 'vitest';
import { createSeoLlmService, validateArabicSeoOutput } from './llm';

describe('SEO LLM resilience and Arabic validation', () => {
  it('opens the circuit breaker after repeated provider failures', async () => {
    const invokeModel = vi.fn(async () => {
      throw new Error('Anthropic 503');
    });

    const retryImpl = vi.fn(async (fn: () => Promise<unknown>, options: { maxRetries: number }) => {
      let attempts = 0;
      while (attempts <= options.maxRetries) {
        attempts += 1;
        try {
          return await fn();
        } catch (error) {
          if (attempts > options.maxRetries) {
            throw error;
          }
        }
      }
      throw new Error('unreachable');
    });

    const service = createSeoLlmService({
      invokeModel,
      retryImpl: retryImpl as any,
      breaker: new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 60_000,
        halfOpenRequests: 1,
      }),
    });

    await expect(service.analyze({ operation: 'keyword_research', prompt: 'best law firm cairo', market: { language: 'ar', dialect: 'egyptian', countryCode: 'EG' } })).rejects.toThrow('Anthropic 503');
    await expect(service.analyze({ operation: 'keyword_research', prompt: 'best law firm cairo', market: { language: 'ar', dialect: 'egyptian', countryCode: 'EG' } })).rejects.toThrow('Anthropic 503');
    await expect(service.analyze({ operation: 'keyword_research', prompt: 'best law firm cairo', market: { language: 'ar', dialect: 'egyptian', countryCode: 'EG' } })).rejects.toThrow(CircuitBreakerOpenError);

    expect(invokeModel).toHaveBeenCalled();
    expect(retryImpl).toHaveBeenCalled();
  });

  it('validates Arabic SEO output for RTL and dialect alignment', () => {
    const output = {
      keywords: [
        'أفضل محامي شركات في القاهرة',
        'أسعار تأسيس شركة في مصر',
      ],
      recommendations: ['استخدم صفحات خدمة محلية تستهدف الباحثين في القاهرة الكبرى دلوقتي.'],
    };

    const validation = validateArabicSeoOutput(output, 'egyptian');

    expect(validation.hasArabicScript).toBe(true);
    expect(validation.isRtlReady).toBe(true);
    expect(validation.isDialectAligned).toBe(true);
  });
});