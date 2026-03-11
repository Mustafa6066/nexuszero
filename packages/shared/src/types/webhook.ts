/** Webhook event types */
export type WebhookEventType =
  | 'agent.status_changed'
  | 'agent.task_completed'
  | 'agent.task_failed'
  | 'agent.error'
  | 'campaign.created'
  | 'campaign.updated'
  | 'campaign.completed'
  | 'creative.generated'
  | 'creative.test_completed'
  | 'aeo.citation_detected'
  | 'aeo.visibility_changed'
  | 'analytics.anomaly_detected'
  | 'analytics.goal_reached'
  | 'onboarding.step_completed'
  | 'onboarding.completed'
  | 'billing.payment_received'
  | 'billing.payment_failed';

/** Webhook delivery status */
export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  secret: string; // HMAC signing secret
  events: WebhookEventType[];
  active: boolean;
  failureCount: number;
  lastDeliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookEndpointId: string;
  tenantId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  httpStatus: number | null;
  responseBody: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

export interface WebhookEvent {
  id: string;
  tenantId: string;
  type: WebhookEventType;
  data: Record<string, unknown>;
  timestamp: Date;
}

/** Override/manual instruction from tenant to agents */
export interface AgentOverride {
  id: string;
  tenantId: string;
  agentType: string;
  action: OverrideAction;
  reason: string;
  parameters: Record<string, unknown>;
  appliedAt: Date | null;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export type OverrideAction =
  | 'pause_agent'
  | 'resume_agent'
  | 'pause_campaign'
  | 'resume_campaign'
  | 'adjust_budget'
  | 'change_bid_strategy'
  | 'blacklist_keyword'
  | 'force_refresh_creative'
  | 'prioritize_task'
  | 'set_guardrails';
