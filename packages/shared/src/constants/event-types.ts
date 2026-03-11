import type { PlanTier } from '../types/tenant.js';

/** Kafka topics for inter-service communication */
export const KAFKA_TOPICS = {
  /** Inbound tasks from API to orchestrator */
  TASKS_INBOUND: 'tasks.inbound',
  /** Completed task results */
  TASKS_COMPLETED: 'tasks.completed',
  /** Failed task reports */
  TASKS_FAILED: 'tasks.failed',
  /** Webhook events */
  EVENTS_WEBHOOK: 'events.webhook',
  /** Audit log events */
  EVENTS_AUDIT: 'events.audit',
  /** Agent commands (activate, pause, etc.) */
  AGENTS_COMMANDS: 'agents.commands',
  /** Agent heartbeat events */
  AGENTS_HEARTBEAT: 'agents.heartbeat',
  /** Cross-agent signals */
  AGENTS_SIGNALS: 'agents.signals',
  /** Onboarding lifecycle events */
  ONBOARDING_EVENTS: 'onboarding.events',
  /** Analytics data ingestion */
  ANALYTICS_INGEST: 'analytics.ingest',
  /** Creative generation events */
  CREATIVE_EVENTS: 'creative.events',
  /** AEO citation events */
  AEO_EVENTS: 'aeo.events',
  /** Compatibility agent requests from other agents */
  COMPATIBILITY_REQUESTS: 'compatibility.requests',
  /** Compatibility agent responses back to requesting agents */
  COMPATIBILITY_RESPONSES: 'compatibility.responses',
  /** Integration lifecycle events */
  INTEGRATION_EVENTS: 'integration.events',
  /** Integration health events */
  INTEGRATION_HEALTH: 'integration.health',

  /** Per-tenant event topic */
  tenantEvents: (tenantId: string) => `events.${tenantId}`,
  /** Per-tenant signal topic */
  tenantSignals: (tenantId: string) => `signals.${tenantId}`,
} as const;

/** BullMQ queue names */
export const QUEUE_NAMES = {
  SEO_TASKS: 'seo-tasks',
  AD_TASKS: 'ad-tasks',
  CREATIVE_TASKS: 'creative-tasks',
  DATA_TASKS: 'data-tasks',
  AEO_TASKS: 'aeo-tasks',
  WEBHOOK_DELIVERY: 'webhook-delivery',
  ONBOARDING: 'onboarding',
  ORCHESTRATOR: 'orchestrator',
  SCHEDULER: 'scheduler',
  COMPATIBILITY_TASKS: 'compatibility-tasks',
  COMPATIBILITY_HEALTH: 'compatibility-health',
  COMPATIBILITY_ONBOARDING: 'compatibility-onboarding',

  /** Get tenant-scoped queue name */
  forTenant: (baseQueue: string, tenantId: string) => `${baseQueue}:${tenantId}`,
} as const;

/** Standardized event type strings */
export const EVENT_TYPES = {
  // Agent lifecycle
  AGENT_ACTIVATED: 'agent.activated',
  AGENT_PAUSED: 'agent.paused',
  AGENT_ERROR: 'agent.error',
  AGENT_HEARTBEAT: 'agent.heartbeat',

  // Task lifecycle
  TASK_CREATED: 'task.created',
  TASK_STARTED: 'task.started',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  TASK_RETRYING: 'task.retrying',

  // Cross-agent signals
  SEO_SIGNAL: 'signal.seo',
  AD_SIGNAL: 'signal.ad',
  CREATIVE_SIGNAL: 'signal.creative',
  DATA_SIGNAL: 'signal.data',
  AEO_SIGNAL: 'signal.aeo',

  // Creative events
  CREATIVE_GENERATED: 'creative.generated',
  CREATIVE_TEST_STARTED: 'creative.test_started',
  CREATIVE_TEST_COMPLETED: 'creative.test_completed',
  CREATIVE_FATIGUE_DETECTED: 'creative.fatigue_detected',
  CREATIVE_WINNER_FOUND: 'creative.winner_found',

  // AEO events
  AEO_CITATION_DETECTED: 'aeo.citation_detected',
  AEO_VISIBILITY_CHANGED: 'aeo.visibility_changed',
  AEO_ENTITY_UPDATED: 'aeo.entity_updated',

  // Onboarding
  ONBOARDING_STARTED: 'onboarding.started',
  ONBOARDING_STEP_COMPLETED: 'onboarding.step_completed',
  ONBOARDING_COMPLETED: 'onboarding.completed',
  ONBOARDING_FAILED: 'onboarding.failed',

  // Integration events (Compatibility Agent)
  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_DEGRADED: 'integration.degraded',
  INTEGRATION_DISCONNECTED: 'integration.disconnected',
  INTEGRATION_RECOVERED: 'integration.recovered',
  INTEGRATION_TOKEN_REFRESHED: 'integration.token_refreshed',
  INTEGRATION_SCOPE_REVOKED: 'integration.scope_revoked',
  INTEGRATION_SCHEMA_CHANGED: 'integration.schema_changed',
  INTEGRATION_REAUTH_NEEDED: 'integration.reauth_needed',
  INTEGRATION_MIGRATION_STARTED: 'integration.migration_started',
  INTEGRATION_MIGRATION_COMPLETED: 'integration.migration_completed',

  // Billing
  BILLING_PAYMENT_RECEIVED: 'billing.payment_received',
  BILLING_PAYMENT_FAILED: 'billing.payment_failed',

  // Analytics
  ANALYTICS_ANOMALY: 'analytics.anomaly_detected',
  ANALYTICS_GOAL_REACHED: 'analytics.goal_reached',
} as const;

/** Consumer groups for Kafka */
export const CONSUMER_GROUPS = {
  ORCHESTRATOR: 'orchestrator-group',
  SEO_AGENT: 'seo-agent-group',
  AD_AGENT: 'ad-agent-group',
  CREATIVE_AGENT: 'creative-agent-group',
  DATA_NEXUS: 'data-nexus-group',
  AEO_AGENT: 'aeo-agent-group',
  WEBHOOK_SERVICE: 'webhook-service-group',
  ANALYTICS_INGEST: 'analytics-ingest-group',
  COMPATIBILITY_AGENT: 'compatibility-agent-group',
} as const;

/** Rate limits per plan tier (requests per minute) */
export const PLAN_RATE_LIMITS: Record<PlanTier, number> = {
  launchpad: 60,
  growth: 300,
  enterprise: 1000,
};

/** Webhook limits per plan */
export const PLAN_WEBHOOK_LIMITS: Record<PlanTier, number> = {
  launchpad: 3,
  growth: 10,
  enterprise: 50,
};

/** Max consecutive webhook failures before disabling */
export const MAX_WEBHOOK_FAILURES = 10;

/** Max webhook delivery retries */
export const MAX_WEBHOOK_RETRIES = 5;
