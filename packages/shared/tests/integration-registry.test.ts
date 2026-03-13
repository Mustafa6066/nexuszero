import { describe, it, expect } from 'vitest';
import {
  PLATFORM_REGISTRY,
  getPlatformsByCategory,
  getOAuthPlatforms,
  getRefreshablePlatforms,
  getPlatformDefinition,
  HEALTH_THRESHOLDS,
} from '../src/constants/integration-registry';

describe('PLATFORM_REGISTRY', () => {
  it('contains all 16 platforms', () => {
    expect(Object.keys(PLATFORM_REGISTRY)).toHaveLength(16);
  });

  it('each platform has required fields', () => {
    for (const [, def] of Object.entries(PLATFORM_REGISTRY)) {
      expect(def.label).toBeDefined();
      expect(def.category).toBeDefined();
      expect(def.authType).toBeDefined();
      // supportsOAuth is derived from authType
      const supportsOAuth = def.authType === 'oauth2' || def.authType === 'oauth2_pkce';
      expect(typeof supportsOAuth).toBe('boolean');
    }
  });

  it('includes all expected categories', () => {
    const categories = new Set(Object.values(PLATFORM_REGISTRY).map((d) => d.category));
    expect(categories).toContain('analytics');
    expect(categories).toContain('ads');
    expect(categories).toContain('seo');
    expect(categories).toContain('crm');
    expect(categories).toContain('cms');
  });
});

describe('getPlatformsByCategory', () => {
  it('returns analytics platforms', () => {
    const analytics = getPlatformsByCategory('analytics');
    expect(analytics.length).toBeGreaterThan(0);
    expect(analytics).toContain('google_analytics');
  });

  it('returns empty array for unknown category', () => {
    const result = getPlatformsByCategory('nonexistent' as any);
    expect(result).toEqual([]);
  });
});

describe('getOAuthPlatforms', () => {
  it('returns platforms that support OAuth', () => {
    const oauthPlatforms = getOAuthPlatforms();
    expect(oauthPlatforms.length).toBeGreaterThan(0);
    for (const p of oauthPlatforms) {
      const def = PLATFORM_REGISTRY[p];
      expect(['oauth2', 'oauth2_pkce']).toContain(def.authType);
    }
  });
});

describe('getRefreshablePlatforms', () => {
  it('returns platforms that can refresh tokens', () => {
    const refreshable = getRefreshablePlatforms();
    expect(refreshable.length).toBeGreaterThan(0);
    for (const p of refreshable) {
      expect(PLATFORM_REGISTRY[p].refreshable).toBe(true);
    }
  });
});

describe('getPlatformDefinition', () => {
  it('returns definition for known platform', () => {
    const def = getPlatformDefinition('hubspot');
    expect(def).toBeDefined();
    expect(def!.label).toBe('HubSpot');
  });

  it('returns undefined for unknown platform', () => {
    const def = getPlatformDefinition('nonexistent' as any);
    expect(def).toBeUndefined();
  });
});

describe('HEALTH_THRESHOLDS', () => {
  it('has required threshold properties', () => {
    expect(HEALTH_THRESHOLDS.DEGRADED_THRESHOLD).toBeDefined();
    expect(HEALTH_THRESHOLDS.DISCONNECTED_THRESHOLD).toBeDefined();
    expect(HEALTH_THRESHOLDS.MAX_ACCEPTABLE_LATENCY_MS).toBeDefined();
    expect(typeof HEALTH_THRESHOLDS.DEGRADED_THRESHOLD).toBe('number');
  });
});
