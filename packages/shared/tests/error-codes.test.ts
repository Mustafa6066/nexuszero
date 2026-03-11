import { describe, it, expect } from 'vitest';
import { ERROR_CODES, AppError } from '../src/constants/error-codes';

describe('ERROR_CODES', () => {
  it('has unique error codes', () => {
    const codes = Object.values(ERROR_CODES).map((e) => e.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('has valid HTTP status codes', () => {
    for (const entry of Object.values(ERROR_CODES)) {
      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.status).toBeLessThanOrEqual(599);
    }
  });
});

describe('AppError', () => {
  it('creates error from error code', () => {
    const err = new AppError('TENANT_NOT_FOUND');
    expect(err.message).toBe('Tenant not found');
    expect(err.status).toBe(404);
    expect(err.code).toBe(2001);
    expect(err.name).toBe('AppError');
  });

  it('supports override message', () => {
    const err = new AppError('VALIDATION_ERROR', undefined, 'Email is required');
    expect(err.message).toBe('Email is required');
    expect(err.status).toBe(400);
  });

  it('includes details in JSON', () => {
    const err = new AppError('VALIDATION_ERROR', { field: 'email' });
    const json = err.toJSON();
    expect(json.error.details).toEqual({ field: 'email' });
    expect(json.error.code).toBe(9001);
  });

  it('is an instance of Error', () => {
    const err = new AppError('INTERNAL_ERROR');
    expect(err).toBeInstanceOf(Error);
  });
});
