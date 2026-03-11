import { z } from 'zod';

export const brandGuidelinesSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().min(1).max(100),
  tone: z.string().min(1).max(100),
  logoUrl: z.string().url().nullable().default(null),
  doNotUse: z.array(z.string()).default([]),
});

export const creativeDimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  label: z.string().min(1).max(100),
});

export const generateCreativeSchema = z.object({
  campaignId: z.string().uuid().nullable().default(null),
  type: z.enum(['image', 'video_script', 'ad_copy', 'landing_page', 'email_template']),
  prompt: z.string().min(10).max(2000),
  brandGuidelines: brandGuidelinesSchema,
  targetAudience: z.string().min(1).max(500),
  platform: z.string().min(1).max(50),
  dimensions: creativeDimensionsSchema.optional(),
  variants: z.number().int().min(1).max(10).default(3),
  referenceCreativeIds: z.array(z.string().uuid()).optional(),
});

export const updateCreativeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['draft', 'generated', 'approved', 'rejected', 'archived']).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const creativeTestSchema = z.object({
  campaignId: z.string().uuid(),
  creativeId: z.string().uuid(),
  variantIds: z.array(z.string()).min(2).max(10),
  confidenceLevel: z.number().min(0.8).max(0.99).default(0.95),
});

export const creativeFiltersSchema = z.object({
  type: z.enum(['image', 'video_script', 'ad_copy', 'landing_page', 'email_template']).optional(),
  status: z.enum(['draft', 'generated', 'approved', 'rejected', 'archived']).optional(),
  campaignId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['name', 'createdAt', 'brandScore', 'predictedCtr']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type GenerateCreativeInput = z.infer<typeof generateCreativeSchema>;
export type UpdateCreativeInput = z.infer<typeof updateCreativeSchema>;
export type CreativeTestInput = z.infer<typeof creativeTestSchema>;
export type CreativeFiltersInput = z.infer<typeof creativeFiltersSchema>;
