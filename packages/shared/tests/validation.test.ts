import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidSlug,
  isValidUuid,
  isValidUrl,
  isValidWebhookUrl,
  sanitizeString,
  validatePagination,
  validateDateRange,
} from '../src/utils/validation';

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user.name+tag@domain.co')).toBe(true);
    expect(isValidEmail('a@b.cc')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('@no-user.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user@.com')).toBe(false);
  });

  it('rejects emails exceeding 254 chars', () => {
    const longLocal = 'a'.repeat(245);
    expect(isValidEmail(`${longLocal}@example.com`)).toBe(false);
  });
});

describe('isValidSlug', () => {
  it('accepts valid slugs', () => {
    expect(isValidSlug('my-slug')).toBe(true);
    expect(isValidSlug('abc123')).toBe(true);
    expect(isValidSlug('ab')).toBe(true);
  });

  it('rejects invalid slugs', () => {
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('My-Slug')).toBe(false);
    expect(isValidSlug('slug_with_underscore')).toBe(false);
    expect(isValidSlug('-starts-dash')).toBe(false);
  });
});

describe('isValidUuid', () => {
  it('accepts valid UUIDs', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
  });

  it('rejects invalid UUIDs', () => {
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('accepts http and https', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('rejects non-http protocols', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('not-a-url')).toBe(false);
  });
});

describe('isValidWebhookUrl', () => {
  it('accepts valid HTTPS URLs', () => {
    expect(isValidWebhookUrl('https://api.example.com/webhooks')).toBe(true);
    expect(isValidWebhookUrl('https://hooks.slack.com/services/abc')).toBe(true);
  });

  it('rejects HTTP', () => {
    expect(isValidWebhookUrl('http://example.com/webhook')).toBe(false);
  });

  it('blocks localhost and loopback', () => {
    expect(isValidWebhookUrl('https://localhost/hook')).toBe(false);
    expect(isValidWebhookUrl('https://127.0.0.1/hook')).toBe(false);
  });

  it('blocks private IP ranges (SSRF)', () => {
    expect(isValidWebhookUrl('https://10.0.0.1/hook')).toBe(false);
    expect(isValidWebhookUrl('https://172.16.0.1/hook')).toBe(false);
    expect(isValidWebhookUrl('https://192.168.1.1/hook')).toBe(false);
  });

  it('blocks cloud metadata endpoints', () => {
    expect(isValidWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('blocks .local and .internal hostnames', () => {
    expect(isValidWebhookUrl('https://myhost.local/hook')).toBe(false);
    expect(isValidWebhookUrl('https://metadata.google.internal/v1')).toBe(false);
  });
});

describe('sanitizeString', () => {
  it('strips HTML tags', () => {
    expect(sanitizeString('<script>alert("xss")</script>Hello')).toBe('Hello');
    expect(sanitizeString('<b>bold</b> text')).toBe('bold text');
  });

  it('truncates to max length', () => {
    const long = 'a'.repeat(2000);
    expect(sanitizeString(long, 100).length).toBe(100);
  });

  it('trims whitespace', () => {
    expect(sanitizeString('  hello world  ')).toBe('hello world');
  });
});

describe('validatePagination', () => {
  it('returns defaults for undefined', () => {
    expect(validatePagination()).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('clamps page to 1 minimum', () => {
    expect(validatePagination(0).page).toBe(1);
    expect(validatePagination(-5).page).toBe(1);
  });

  it('clamps limit between 1 and 100', () => {
    expect(validatePagination(1, 0).limit).toBe(1);
    expect(validatePagination(1, 500).limit).toBe(100);
  });

  it('calculates correct offset', () => {
    expect(validatePagination(3, 10).offset).toBe(20);
  });
});

describe('validateDateRange', () => {
  it('parses valid date ranges', () => {
    const result = validateDateRange('2024-01-01', '2024-06-01');
    expect(result).not.toBeNull();
    expect(result!.start.getFullYear()).toBe(2024);
  });

  it('rejects start > end', () => {
    expect(validateDateRange('2024-12-01', '2024-01-01')).toBeNull();
  });

  it('rejects invalid dates', () => {
    expect(validateDateRange('not-a-date', '2024-01-01')).toBeNull();
  });

  it('rejects ranges exceeding 1 year', () => {
    expect(validateDateRange('2022-01-01', '2024-01-01')).toBeNull();
  });
});
