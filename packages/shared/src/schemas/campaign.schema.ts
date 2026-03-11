import { z } from 'zod';

export const bidStrategySchema = z.enum([
  'manual_cpc', 'target_cpa', 'target_roas', 'maximize_conversions', 'maximize_clicks',
]);

export const targetAudienceSchema = z.object({
  locations: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  ageRange: z.object({ min: z.number().min(13), max: z.number().max(100) }).nullable().default(null),
  genders: z.array(z.enum(['male', 'female', 'all'])).default(['all']),
  interests: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  excludedKeywords: z.array(z.string()).default([]),
  customAudiences: z.array(z.string()).default([]),
  lookalikes: z.array(z.string()).default([]),
});

export const daypartingRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  bidModifier: z.number().min(0.1).max(10),
});

export const campaignScheduleSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  dayparting: z.array(daypartingRuleSchema).nullable().default(null),
});

export const seoConfigSchema = z.object({
  targetKeywords: z.array(z.string()).min(1),
  contentBriefs: z.boolean().default(true),
  technicalAudit: z.boolean().default(true),
  backlinkOutreach: z.boolean().default(false),
  aeoOptimization: z.boolean().default(false),
});

export const adGroupSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.array(z.string()),
  matchType: z.enum(['broad', 'phrase', 'exact']),
  maxCpc: z.number().positive().nullable().default(null),
});

export const ppcConfigSchema = z.object({
  adGroups: z.array(adGroupSchema).min(1),
  negativeKeywords: z.array(z.string()).default([]),
  adExtensions: z.array(z.string()).default([]),
  conversionTracking: z.boolean().default(true),
});

export const campaignConfigSchema = z.object({
  seo: seoConfigSchema.optional(),
  ppc: ppcConfigSchema.optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['seo', 'ppc', 'social', 'display', 'video', 'email']),
  platform: z.enum(['google_ads', 'meta_ads', 'linkedin_ads']).nullable().default(null),
  budget: z.object({
    dailyBudget: z.number().positive(),
    totalBudget: z.number().positive().nullable().default(null),
    currency: z.string().length(3).default('USD'),
    bidStrategy: bidStrategySchema.default('maximize_conversions'),
    targetCpa: z.number().positive().nullable().default(null),
    targetRoas: z.number().positive().nullable().default(null),
  }),
  targeting: targetAudienceSchema.default({}),
  schedule: campaignScheduleSchema,
  config: campaignConfigSchema.default({}),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['draft', 'pending_review', 'active', 'paused', 'completed', 'archived']).optional(),
  budget: z.object({
    dailyBudget: z.number().positive().optional(),
    totalBudget: z.number().positive().nullable().optional(),
    bidStrategy: bidStrategySchema.optional(),
    targetCpa: z.number().positive().nullable().optional(),
    targetRoas: z.number().positive().nullable().optional(),
  }).optional(),
  targeting: targetAudienceSchema.partial().optional(),
  schedule: campaignScheduleSchema.partial().optional(),
  config: campaignConfigSchema.partial().optional(),
});

export const campaignFiltersSchema = z.object({
  type: z.enum(['seo', 'ppc', 'social', 'display', 'video', 'email']).optional(),
  status: z.enum(['draft', 'pending_review', 'active', 'paused', 'completed', 'archived']).optional(),
  platform: z.enum(['google_ads', 'meta_ads', 'linkedin_ads']).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'spend', 'roas']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const analyticsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  metrics: z.array(z.string()).min(1),
  dimensions: z.array(z.string()).optional(),
  limit: z.coerce.number().int().positive().max(10000).default(1000),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type CampaignFiltersInput = z.infer<typeof campaignFiltersSchema>;
export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
