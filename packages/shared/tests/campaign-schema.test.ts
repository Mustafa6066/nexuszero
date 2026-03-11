import { describe, it, expect } from 'vitest';
import { createCampaignSchema, targetAudienceSchema, daypartingRuleSchema, seoConfigSchema, adGroupSchema } from '../src/schemas/campaign.schema';

describe('createCampaignSchema', () => {
  const validCampaign = {
    name: 'Summer Sale 2024',
    type: 'ppc' as const,
    platform: 'google_ads' as const,
    budget: {
      dailyBudget: 100,
      currency: 'USD',
      bidStrategy: 'maximize_conversions' as const,
    },
    schedule: { startDate: '2024-07-01' },
  };

  it('accepts valid campaign', () => {
    const result = createCampaignSchema.safeParse(validCampaign);
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const { name, ...rest } = validCampaign;
    const result = createCampaignSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = createCampaignSchema.safeParse({ ...validCampaign, type: 'radio' });
    expect(result.success).toBe(false);
  });

  it('rejects zero budget', () => {
    const result = createCampaignSchema.safeParse({
      ...validCampaign,
      budget: { ...validCampaign.budget, dailyBudget: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const result = createCampaignSchema.safeParse({
      ...validCampaign,
      schedule: { startDate: 'July 1 2024' },
    });
    expect(result.success).toBe(false);
  });
});

describe('targetAudienceSchema', () => {
  it('fills defaults for empty object', () => {
    const result = targetAudienceSchema.parse({});
    expect(result.genders).toEqual(['all']);
    expect(result.locations).toEqual([]);
  });

  it('rejects age below 13', () => {
    const result = targetAudienceSchema.safeParse({ ageRange: { min: 5, max: 65 } });
    expect(result.success).toBe(false);
  });
});

describe('daypartingRuleSchema', () => {
  it('accepts valid rule', () => {
    const result = daypartingRuleSchema.safeParse({ dayOfWeek: 1, startHour: 9, endHour: 17, bidModifier: 1.5 });
    expect(result.success).toBe(true);
  });

  it('rejects dayOfWeek > 6', () => {
    const result = daypartingRuleSchema.safeParse({ dayOfWeek: 7, startHour: 9, endHour: 17, bidModifier: 1 });
    expect(result.success).toBe(false);
  });
});

describe('seoConfigSchema', () => {
  it('requires at least one keyword', () => {
    const result = seoConfigSchema.safeParse({ targetKeywords: [] });
    expect(result.success).toBe(false);
  });

  it('accepts valid config', () => {
    const result = seoConfigSchema.safeParse({ targetKeywords: ['seo tools'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contentBriefs).toBe(true);
      expect(result.data.backlinkOutreach).toBe(false);
    }
  });
});

describe('adGroupSchema', () => {
  it('rejects empty name', () => {
    const result = adGroupSchema.safeParse({ name: '', keywords: ['test'], matchType: 'broad' });
    expect(result.success).toBe(false);
  });
});
