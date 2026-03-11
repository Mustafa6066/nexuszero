import { describe, it, expect } from 'vitest';
import { generateCreativeSchema, brandGuidelinesSchema, updateCreativeSchema, creativeTestSchema, creativeFiltersSchema } from '../src/schemas/creative.schema';

describe('generateCreativeSchema', () => {
  const validInput = {
    type: 'ad_copy' as const,
    prompt: 'Generate a compelling ad copy for a fitness brand targeting millennials',
    brandGuidelines: {
      primaryColor: '#FF5500',
      secondaryColor: '#003366',
      fontFamily: 'Inter',
      tone: 'energetic',
    },
    targetAudience: 'Millennials interested in fitness',
    platform: 'meta_ads',
  };

  it('accepts valid creative generation request', () => {
    const result = generateCreativeSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variants).toBe(3); // default
    }
  });

  it('rejects prompt shorter than 10 chars', () => {
    const result = generateCreativeSchema.safeParse({ ...validInput, prompt: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid creative type', () => {
    const result = generateCreativeSchema.safeParse({ ...validInput, type: 'podcast' });
    expect(result.success).toBe(false);
  });

  it('rejects > 10 variants', () => {
    const result = generateCreativeSchema.safeParse({ ...validInput, variants: 15 });
    expect(result.success).toBe(false);
  });
});

describe('brandGuidelinesSchema', () => {
  it('rejects invalid hex color', () => {
    const result = brandGuidelinesSchema.safeParse({
      primaryColor: 'red',
      secondaryColor: '#003366',
      fontFamily: 'Arial',
      tone: 'professional',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateCreativeSchema', () => {
  it('accepts partial update', () => {
    const result = updateCreativeSchema.safeParse({ status: 'approved' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateCreativeSchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });

  it('rejects too many tags', () => {
    const tags = Array.from({ length: 25 }, (_, i) => `tag${i}`);
    const result = updateCreativeSchema.safeParse({ tags });
    expect(result.success).toBe(false);
  });
});

describe('creativeTestSchema', () => {
  it('requires at least 2 variants', () => {
    const result = creativeTestSchema.safeParse({
      campaignId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      creativeId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
      variantIds: ['one'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects confidence below 0.8', () => {
    const result = creativeTestSchema.safeParse({
      campaignId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      creativeId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
      variantIds: ['a', 'b'],
      confidenceLevel: 0.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('creativeFiltersSchema', () => {
  it('provides defaults', () => {
    const result = creativeFiltersSchema.parse({});
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortOrder).toBe('desc');
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});
