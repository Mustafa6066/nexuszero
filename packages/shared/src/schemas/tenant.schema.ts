import { z } from 'zod';
import { isValidWebhookUrl } from '../utils/validation.js';

export const tenantBrandingSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color'),
  logoUrl: z.string().url().nullable(),
  companyName: z.string().min(1).max(200),
});

export const tenantSettingsSchema = z.object({
  branding: tenantBrandingSchema,
  timezone: z.string().min(1).max(64).default('UTC'),
  weeklyReportEnabled: z.boolean().default(true),
  slackWebhookUrl: z.string().url().refine(isValidWebhookUrl, { message: 'Slack webhook URL must be a valid public HTTPS URL' }).nullable().default(null),
  notificationEmail: z.string().email().nullable().default(null),
});

export const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  domain: z.string().url().nullable().optional(),
  plan: z.enum(['launchpad', 'growth', 'enterprise']),
  settings: tenantSettingsSchema.optional(),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1).max(100),
  ownerPassword: z.string().min(8).max(128),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  domain: z.string().url().nullable().optional(),
  plan: z.enum(['launchpad', 'growth', 'enterprise']).optional(),
  settings: tenantSettingsSchema.partial().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
