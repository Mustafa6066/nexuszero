/** Health score thresholds and alert configuration */

import type { Platform } from '@nexuszero/shared';

export interface HealthThresholdConfig {
  /** Below this health score, mark integration as degraded */
  degradedThreshold: number;
  /** Below this health score, mark integration as disconnected */
  disconnectedThreshold: number;
  /** Max acceptable P95 latency in ms */
  maxLatencyMs: number;
  /** Rate limit utilization % that triggers throttling */
  rateLimitThrottlePercent: number;
  /** Max consecutive errors before escalation */
  maxConsecutiveErrors: number;
  /** Alert cooldown in ms (don't alert again within this window) */
  alertCooldownMs: number;
}

const DEFAULT_THRESHOLDS: HealthThresholdConfig = {
  degradedThreshold: 50,
  disconnectedThreshold: 20,
  maxLatencyMs: 5000,
  rateLimitThrottlePercent: 80,
  maxConsecutiveErrors: 5,
  alertCooldownMs: 3600000, // 1 hour
};

/** Platform-specific overrides (merged with defaults) */
const PLATFORM_OVERRIDES: Partial<Record<Platform, Partial<HealthThresholdConfig>>> = {
  google_ads: {
    maxLatencyMs: 10000,
    rateLimitThrottlePercent: 70,
  },
  meta_ads: {
    maxLatencyMs: 8000,
    maxConsecutiveErrors: 3,
  },
  salesforce: {
    maxLatencyMs: 15000,
    rateLimitThrottlePercent: 75,
  },
  wordpress: {
    maxLatencyMs: 15000,
    maxConsecutiveErrors: 3,
  },
};

export function getHealthThresholds(platform: Platform): HealthThresholdConfig {
  const overrides = PLATFORM_OVERRIDES[platform] ?? {};
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}

export { DEFAULT_THRESHOLDS };
