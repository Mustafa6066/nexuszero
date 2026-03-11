import { z } from 'zod';

export const webhookEventTypes = [
  'agent.status_changed',
  'agent.task_completed',
  'agent.task_failed',
  'agent.error',
  'campaign.created',
  'campaign.updated',
  'campaign.completed',
  'creative.generated',
  'creative.test_completed',
  'aeo.citation_detected',
  'aeo.visibility_changed',
  'analytics.anomaly_detected',
  'analytics.goal_reached',
  'onboarding.step_completed',
  'onboarding.completed',
  'billing.payment_received',
  'billing.payment_failed',
] as const;

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(webhookEventTypes)).min(1),
  active: z.boolean().default(true),
});

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(webhookEventTypes)).min(1).optional(),
  active: z.boolean().optional(),
});

export const overrideSchema = z.object({
  agentType: z.string().min(1),
  action: z.enum([
    'pause_agent', 'resume_agent', 'pause_campaign', 'resume_campaign',
    'adjust_budget', 'change_bid_strategy', 'blacklist_keyword',
    'force_refresh_creative', 'prioritize_task', 'set_guardrails',
  ]),
  reason: z.string().min(1).max(500),
  parameters: z.record(z.unknown()).default({}),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
export type OverrideInput = z.infer<typeof overrideSchema>;
