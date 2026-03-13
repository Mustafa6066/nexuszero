/**
 * Zod schemas for integration-related API inputs.
 */

import { z } from 'zod';

const platformValues = [
  'google_analytics', 'google_ads', 'google_search_console', 'meta_ads',
  'linkedin_ads', 'hubspot', 'salesforce', 'wordpress', 'webflow',
  'contentful', 'shopify', 'mixpanel', 'amplitude', 'slack', 'sendgrid', 'stripe_connect',
] as const;

export const platformSchema = z.enum(platformValues);

export const integrationStatusSchema = z.enum([
  'connected', 'degraded', 'disconnected', 'expired', 'reconnecting',
]);

export const detectStackSchema = z.object({
  websiteUrl: z.string().url('Must be a valid URL (include https://)'),
});

export const startOnboardingSchema = z.object({
  websiteUrl: z.string().url('Must be a valid URL (include https://)'),
  selectedPlatforms: z.array(platformSchema).optional(),
  skipDetection: z.boolean().optional().default(false),
});

export const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1).optional(),
  platform: platformSchema,
});

export const addIntegrationSchema = z.object({
  platform: platformSchema,
  config: z.record(z.unknown()).optional().default({}),
});

export const reconnectIntegrationSchema = z.object({
  force: z.boolean().optional().default(false),
});

export const compatibilityRequestSchema = z.object({
  tenantId: z.string().min(1),
  connector: platformSchema.optional(),
  action: z.string().min(1).max(100),
  params: z.record(z.unknown()).optional().default({}),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional().default('normal'),
});

export type DetectStackInput = z.infer<typeof detectStackSchema>;
export type StartOnboardingInput = z.infer<typeof startOnboardingSchema>;
export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;
export type AddIntegrationInput = z.infer<typeof addIntegrationSchema>;
export type ReconnectIntegrationInput = z.infer<typeof reconnectIntegrationSchema>;
export type CompatibilityRequestInput = z.infer<typeof compatibilityRequestSchema>;
