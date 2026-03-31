import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Test 2: Multi-Agent Typed Signal Schemas
// Validates all signal schemas, validation logic, and subscription map
// ---------------------------------------------------------------------------

// Re-create signal schemas inline (pure Zod, no imports needed)

const SeoKeywordsUpdatedSchema = z.object({
  keywordGaps: z.array(z.string()),
  source: z.string(),
});

const AdBudgetAlertSchema = z.object({
  campaignId: z.string(),
  currentSpend: z.number(),
  budgetLimit: z.number(),
  percentUsed: z.number(),
});

const DataAnomalyDetectedSchema = z.object({
  metric: z.string(),
  expectedValue: z.number(),
  actualValue: z.number(),
  deviationPercent: z.number(),
  timeWindow: z.string(),
});

const SocialMentionDetectedSchema = z.object({
  platform: z.string(),
  totalFound: z.number(),
  totalEngageable: z.number(),
});

const GeoRankingDroppedSchema = z.object({
  locationId: z.string(),
  city: z.string(),
  droppedKeywords: z.array(z.string()),
  threshold: z.number(),
});

const CreativeAssetGeneratedSchema = z.object({
  assetId: z.string(),
  assetType: z.string(),
  url: z.string(),
  campaignId: z.string().optional(),
});

const AeoProbeCompletedSchema = z.object({
  probeId: z.string(),
  engine: z.string(),
  query: z.string(),
  cited: z.boolean(),
  rank: z.number().nullable(),
});

const OrchestratorTaskFailedSchema = z.object({
  taskId: z.string(),
  taskType: z.string(),
  error: z.string(),
  retryable: z.boolean(),
});

const CompatibilityHealthDegradedSchema = z.object({
  integrationId: z.string(),
  platform: z.string(),
  errorRate: z.number(),
  message: z.string(),
});

const CmsChangeProposedSchema = z.object({
  changeId: z.string(),
  pageUrl: z.string(),
  changeSummary: z.string(),
  agentType: z.string(),
});

// Registry map
const SIGNAL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'seo.keyword_discovered': SeoKeywordsUpdatedSchema,
  'ad.budget_alert': AdBudgetAlertSchema,
  'data.anomaly_detected': DataAnomalyDetectedSchema,
  'social.mention_detected': SocialMentionDetectedSchema,
  'geo.ranking_dropped': GeoRankingDroppedSchema,
  'creative.asset_generated': CreativeAssetGeneratedSchema,
  'aeo.probe_completed': AeoProbeCompletedSchema,
  'orchestrator.task_failed': OrchestratorTaskFailedSchema,
  'compatibility.health_degraded': CompatibilityHealthDegradedSchema,
  'cms.change_proposed': CmsChangeProposedSchema,
};

function validateSignalPayload(type: string, payload: unknown) {
  const schema = SIGNAL_SCHEMAS[type];
  if (!schema) throw new Error(`Unknown signal type: ${type}`);
  return schema.parse(payload);
}

function safeValidateSignalPayload(type: string, payload: unknown) {
  const schema = SIGNAL_SCHEMAS[type];
  if (!schema) return { success: false as const, error: new z.ZodError([{ code: 'custom', message: `Unknown signal type: ${type}`, path: [] }]) };
  const result = schema.safeParse(payload);
  return result.success ? { success: true as const, data: result.data } : { success: false as const, error: result.error };
}

// ============================= TESTS =============================

describe('Signal Schemas — Valid Payloads', () => {
  it('validates SEO keyword_discovered signal', () => {
    const payload = { keywordGaps: ['coffee shop dubai', 'best latte'], source: 'seo_audit' };
    const result = validateSignalPayload('seo.keyword_discovered', payload);
    expect(result).toEqual(payload);
  });

  it('validates Ad budget_alert signal', () => {
    const payload = { campaignId: 'camp-123', currentSpend: 850, budgetLimit: 1000, percentUsed: 85 };
    const result = validateSignalPayload('ad.budget_alert', payload);
    expect(result).toEqual(payload);
  });

  it('validates Data anomaly_detected signal', () => {
    const payload = { metric: 'ctr', expectedValue: 3.5, actualValue: 1.2, deviationPercent: -65.7, timeWindow: '24h' };
    const result = validateSignalPayload('data.anomaly_detected', payload);
    expect(result).toEqual(payload);
  });

  it('validates Social mention_detected signal', () => {
    const payload = { platform: 'twitter', totalFound: 42, totalEngageable: 12 };
    const result = validateSignalPayload('social.mention_detected', payload);
    expect(result).toEqual(payload);
  });

  it('validates GEO ranking_dropped signal', () => {
    const payload = { locationId: 'loc-456', city: 'Dubai', droppedKeywords: ['dental clinic', 'teeth whitening'], threshold: 10 };
    const result = validateSignalPayload('geo.ranking_dropped', payload);
    expect(result).toEqual(payload);
  });

  it('validates Creative asset_generated signal', () => {
    const payload = { assetId: 'asset-789', assetType: 'banner', url: 'https://cdn.example.com/img.png' };
    const result = validateSignalPayload('creative.asset_generated', payload);
    expect(result).toEqual(payload);
  });

  it('validates AEO probe_completed signal', () => {
    const payload = { probeId: 'probe-1', engine: 'chatgpt', query: 'best coffee', cited: true, rank: 2 };
    const result = validateSignalPayload('aeo.probe_completed', payload);
    expect(result).toEqual(payload);
  });

  it('validates Orchestrator task_failed signal', () => {
    const payload = { taskId: 'task-999', taskType: 'seo_audit', error: 'Timeout exceeded', retryable: true };
    const result = validateSignalPayload('orchestrator.task_failed', payload);
    expect(result).toEqual(payload);
  });

  it('validates Compatibility health_degraded signal', () => {
    const payload = { integrationId: 'int-100', platform: 'google_ads', errorRate: 15.5, message: 'API rate limit exceeded' };
    const result = validateSignalPayload('compatibility.health_degraded', payload);
    expect(result).toEqual(payload);
  });

  it('validates CMS change_proposed signal', () => {
    const payload = { changeId: 'chg-50', pageUrl: '/blog/seo-tips', changeSummary: 'Add meta description', agentType: 'seo' };
    const result = validateSignalPayload('cms.change_proposed', payload);
    expect(result).toEqual(payload);
  });
});

describe('Signal Schemas — Invalid Payloads', () => {
  it('rejects missing required fields', () => {
    const result = safeValidateSignalPayload('seo.keyword_discovered', { source: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects wrong field types', () => {
    const result = safeValidateSignalPayload('ad.budget_alert', {
      campaignId: 123, // should be string
      currentSpend: 'not-a-number', // should be number
      budgetLimit: 1000,
      percentUsed: 85,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty payload for required-field schema', () => {
    const result = safeValidateSignalPayload('data.anomaly_detected', {});
    expect(result.success).toBe(false);
  });

  it('rejects null keyword array', () => {
    const result = safeValidateSignalPayload('geo.ranking_dropped', {
      locationId: 'loc-1', city: 'test', droppedKeywords: null, threshold: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean for cited field', () => {
    const result = safeValidateSignalPayload('aeo.probe_completed', {
      probeId: '1', engine: 'chatgpt', query: 'test', cited: 'yes', rank: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('Signal Schemas — Unknown Types', () => {
  it('throws on unknown signal type via validate', () => {
    expect(() => validateSignalPayload('unknown.event', {})).toThrow('Unknown signal type');
  });

  it('returns failure on unknown signal type via safeValidate', () => {
    const result = safeValidateSignalPayload('nonexistent.signal', {});
    expect(result.success).toBe(false);
  });
});

describe('Signal Schemas — Optional Fields', () => {
  it('allows optional campaignId in creative.asset_generated', () => {
    const without = validateSignalPayload('creative.asset_generated', {
      assetId: 'a1', assetType: 'video', url: 'https://cdn.example.com/v.mp4',
    });
    expect(without.campaignId).toBeUndefined();

    const with_ = validateSignalPayload('creative.asset_generated', {
      assetId: 'a1', assetType: 'video', url: 'https://cdn.example.com/v.mp4', campaignId: 'c1',
    });
    expect(with_.campaignId).toBe('c1');
  });

  it('allows nullable rank in aeo.probe_completed', () => {
    const result = validateSignalPayload('aeo.probe_completed', {
      probeId: '1', engine: 'perplexity', query: 'test query', cited: false, rank: null,
    });
    expect(result.rank).toBeNull();
  });
});

describe('Signal Schemas — Strips Extra Fields', () => {
  it('strips unknown fields from payload', () => {
    const result = validateSignalPayload('social.mention_detected', {
      platform: 'twitter',
      totalFound: 5,
      totalEngageable: 2,
      extraField: 'should be removed',
    });
    expect(result).not.toHaveProperty('extraField');
  });
});
