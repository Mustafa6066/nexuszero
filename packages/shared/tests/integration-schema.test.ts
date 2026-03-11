import { describe, it, expect } from 'vitest';
import {
  platformSchema,
  detectStackSchema,
  startOnboardingSchema,
  oauthCallbackSchema,
  addIntegrationSchema,
  compatibilityRequestSchema,
} from '../src/schemas/integration.schema';

describe('platformSchema', () => {
  it('accepts valid platforms', () => {
    const platforms = [
      'google_analytics', 'google_ads', 'google_search_console',
      'meta_ads', 'linkedin_ads', 'hubspot', 'salesforce',
      'wordpress', 'webflow', 'contentful', 'shopify',
      'slack', 'sendgrid', 'stripe_connect', 'mixpanel', 'amplitude',
    ];
    for (const p of platforms) {
      expect(platformSchema.safeParse(p).success).toBe(true);
    }
  });

  it('rejects invalid platforms', () => {
    expect(platformSchema.safeParse('twitter').success).toBe(false);
    expect(platformSchema.safeParse('').success).toBe(false);
    expect(platformSchema.safeParse(123).success).toBe(false);
  });
});

describe('detectStackSchema', () => {
  it('accepts valid URL', () => {
    const result = detectStackSchema.safeParse({ websiteUrl: 'https://example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects non-URL strings', () => {
    const result = detectStackSchema.safeParse({ websiteUrl: 'not a url' });
    expect(result.success).toBe(false);
  });

  it('rejects missing websiteUrl', () => {
    const result = detectStackSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('startOnboardingSchema', () => {
  it('accepts valid input', () => {
    const result = startOnboardingSchema.safeParse({ websiteUrl: 'https://mysite.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid input', () => {
    const result = startOnboardingSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('oauthCallbackSchema', () => {
  it('accepts valid callback data', () => {
    const result = oauthCallbackSchema.safeParse({
      platform: 'google_analytics',
      code: 'auth_code_123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts callback with optional state', () => {
    const result = oauthCallbackSchema.safeParse({
      platform: 'meta_ads',
      code: 'auth_code_456',
      state: 'state_token_789',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing code', () => {
    const result = oauthCallbackSchema.safeParse({ platform: 'hubspot' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform', () => {
    const result = oauthCallbackSchema.safeParse({ platform: 'twitter', code: '123' });
    expect(result.success).toBe(false);
  });
});

describe('addIntegrationSchema', () => {
  it('accepts valid integration', () => {
    const result = addIntegrationSchema.safeParse({
      platform: 'shopify',
    });
    expect(result.success).toBe(true);
  });

  it('accepts integration with optional config', () => {
    const result = addIntegrationSchema.safeParse({
      platform: 'wordpress',
      config: { siteUrl: 'https://myblog.com' },
    });
    expect(result.success).toBe(true);
  });
});

describe('compatibilityRequestSchema', () => {
  it('accepts valid request', () => {
    const result = compatibilityRequestSchema.safeParse({
      tenantId: 'tenant_123',
      action: 'health_check',
    });
    expect(result.success).toBe(true);
  });

  it('accepts request with platform', () => {
    const result = compatibilityRequestSchema.safeParse({
      tenantId: 'tenant_123',
      action: 'connect',
      platform: 'google_analytics',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing tenantId', () => {
    const result = compatibilityRequestSchema.safeParse({ action: 'health_check' });
    expect(result.success).toBe(false);
  });

  it('rejects missing action', () => {
    const result = compatibilityRequestSchema.safeParse({ tenantId: 'tenant_123' });
    expect(result.success).toBe(false);
  });
});
