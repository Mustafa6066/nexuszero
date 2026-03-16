import type { AgentType, TaskPriority } from '@nexuszero/shared';
import type { TraceCarrier } from '@nexuszero/shared';

/** All event types that can be passed between agents via Kafka */
export type InterAgentEventType =
  | 'seo.keyword_discovered'
  | 'seo.content_published'
  | 'seo.ranking_changed'
  | 'seo.backlink_acquired'
  | 'ad.campaign_launched'
  | 'ad.budget_alert'
  | 'ad.performance_update'
  | 'ad.creative_needed'
  | 'creative.asset_generated'
  | 'creative.test_completed'
  | 'creative.fatigue_detected'
  | 'creative.winner_found'
  | 'data.insight_generated'
  | 'data.anomaly_detected'
  | 'data.forecast_updated'
  | 'data.funnel_alert'
  | 'aeo.citation_found'
  | 'aeo.visibility_changed'
  | 'aeo.entity_updated'
  | 'compatibility.integration_connected'
  | 'compatibility.integration_disconnected'
  | 'compatibility.health_degraded'
  | 'compatibility.schema_drift_detected'
  | 'compatibility.onboarding_completed'
  | 'aeo.probe_completed'
  | 'cms.change_proposed'
  | 'cms.change_pushed'
  | 'seo.competitor_analyzed'
  | 'orchestrator.task_assigned'
  | 'orchestrator.task_completed'
  | 'orchestrator.task_failed'
  | 'data.anomaly_escalated'
  | 'creative.critic_evaluated';

/** Base event payload for inter-agent messages */
export interface InterAgentEvent<T = Record<string, unknown>> {
  id: string;
  tenantId: string;
  type: InterAgentEventType;
  sourceAgent: AgentType | 'orchestrator';
  targetAgent: AgentType | 'broadcast';
  payload: T;
  priority: TaskPriority;
  confidence: number;
  timestamp: string;
  correlationId: string;
  traceContext?: TraceCarrier;
}

/** Task payload for BullMQ jobs */
export interface TaskPayload {
  taskId: string;
  tenantId: string;
  agentType: AgentType;
  taskType: string;
  priority: TaskPriority;
  payload: Record<string, unknown>;
  correlationId: string;
  maxRetries: number;
  scheduledAt?: string;
  dependsOn?: string[];
  traceContext?: TraceCarrier;
}

/** Task result payload */
export interface TaskResult {
  taskId: string;
  tenantId: string;
  agentType: AgentType;
  taskType: string;
  status: 'completed' | 'failed';
  result?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  correlationId: string;
  traceContext?: TraceCarrier;
}

/** Webhook delivery payload */
export interface WebhookDeliveryPayload {
  deliveryId: string;
  endpointId: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  url: string;
  secret: string;
  retryCount: number;
  maxRetries: number;
}

/** Onboarding step payload */
export interface OnboardingPayload {
  tenantId: string;
  step: 'shadow_audit' | 'firmographic_enrichment' | 'oauth_connect' | 'instant_audit' | 'provision' | 'strategy_generate' | 'go_live';
  config: Record<string, unknown>;
  traceContext?: TraceCarrier;
}
