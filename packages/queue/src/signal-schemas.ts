import { z } from 'zod';
import type { AgentType, TaskPriority } from '@nexuszero/shared';

// ---------------------------------------------------------------------------
// Typed Inter-Agent Signal Schemas
//
// Every signal exchanged between agents must conform to one of these schemas.
// This provides compile-time type safety + runtime Zod validation.
// ---------------------------------------------------------------------------

// ---- SEO Agent signals ----

export const SeoKeywordsUpdatedSchema = z.object({
  keywordGaps: z.array(z.string()),
  source: z.string(),
});

export const SeoContentPublishedSchema = z.object({
  contentId: z.string(),
  url: z.string().url(),
  keywords: z.array(z.string()),
  title: z.string(),
});

export const SeoRankingChangedSchema = z.object({
  keyword: z.string(),
  previousRank: z.number().nullable(),
  currentRank: z.number().nullable(),
  url: z.string(),
});

export const SeoCompetitorAnalyzedSchema = z.object({
  competitorDomain: z.string(),
  gaps: z.array(z.object({ keyword: z.string(), competitorRank: z.number(), ownRank: z.number().nullable() })),
  opportunities: z.array(z.string()),
});

// ---- Ad Agent signals ----

export const AdCampaignLaunchedSchema = z.object({
  campaignId: z.string(),
  platform: z.string(),
  budget: z.number(),
});

export const AdBudgetAlertSchema = z.object({
  campaignId: z.string(),
  currentSpend: z.number(),
  budgetLimit: z.number(),
  percentUsed: z.number(),
});

export const AdPerformanceUpdateSchema = z.object({
  campaignId: z.string(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  cpa: z.number().nullable(),
  roas: z.number().nullable(),
});

export const AdCreativeNeededSchema = z.object({
  campaignId: z.string(),
  reason: z.string(),
  specs: z.record(z.unknown()).optional(),
});

// ---- Creative Agent signals ----

export const CreativeAssetGeneratedSchema = z.object({
  assetId: z.string(),
  assetType: z.string(),
  url: z.string(),
  campaignId: z.string().optional(),
});

export const CreativeTestCompletedSchema = z.object({
  testId: z.string(),
  variants: z.array(z.object({ variantId: z.string(), metric: z.number() })),
  winnerId: z.string().nullable(),
});

export const CreativeFatigueDetectedSchema = z.object({
  assetId: z.string(),
  campaignId: z.string(),
  ctrDrop: z.number(),
  daysSinceLaunch: z.number(),
});

export const CreativeWinnerFoundSchema = z.object({
  testId: z.string(),
  winnerId: z.string(),
  improvementPercent: z.number(),
});

export const CreativeCriticEvaluatedSchema = z.object({
  assetId: z.string(),
  score: z.number(),
  feedback: z.string(),
});

// ---- Data Nexus signals ----

export const DataInsightGeneratedSchema = z.object({
  insightId: z.string(),
  category: z.string(),
  summary: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  metrics: z.record(z.number()).optional(),
});

export const DataAnomalyDetectedSchema = z.object({
  metric: z.string(),
  expectedValue: z.number(),
  actualValue: z.number(),
  deviationPercent: z.number(),
  timeWindow: z.string(),
});

export const DataAnomalyEscalatedSchema = z.object({
  anomalyId: z.string(),
  metric: z.string(),
  severity: z.enum(['warning', 'critical']),
  impactedCampaigns: z.array(z.string()),
});

export const DataForecastUpdatedSchema = z.object({
  metric: z.string(),
  forecast: z.array(z.object({ date: z.string(), predicted: z.number(), confidence: z.number() })),
});

export const DataFunnelAlertSchema = z.object({
  stage: z.string(),
  dropOffPercent: z.number(),
  previousRate: z.number(),
  currentRate: z.number(),
});

// ---- AEO Agent signals ----

export const AeoCitationFoundSchema = z.object({
  engine: z.string(),
  query: z.string(),
  position: z.number().nullable(),
  snippet: z.string(),
});

export const AeoVisibilityChangedSchema = z.object({
  engine: z.string(),
  previousScore: z.number(),
  currentScore: z.number(),
  queries: z.array(z.string()),
});

export const AeoEntityUpdatedSchema = z.object({
  entityName: z.string(),
  entityType: z.string(),
  changes: z.record(z.unknown()),
});

export const AeoProbeCompletedSchema = z.object({
  probeId: z.string(),
  engine: z.string(),
  query: z.string(),
  cited: z.boolean(),
  rank: z.number().nullable(),
});

// ---- GEO Agent signals ----

export const GeoRankingDroppedSchema = z.object({
  locationId: z.string(),
  city: z.string(),
  droppedKeywords: z.array(z.string()),
  threshold: z.number(),
});

export const GeoCitationAuditCompletedSchema = z.object({
  locationId: z.string(),
  totalCitations: z.number(),
  inconsistencies: z.number(),
  missingPlatforms: z.array(z.string()),
});

// ---- Social Agent signals ----

export const SocialMentionDetectedSchema = z.object({
  platform: z.string(),
  totalFound: z.number(),
  totalEngageable: z.number(),
});

export const SocialTrendDetectedSchema = z.object({
  platform: z.string(),
  topic: z.string(),
  relevanceScore: z.number(),
  volume: z.number(),
});

// ---- Reddit Agent signals ----

export const RedditMentionDetectedSchema = z.object({
  subreddit: z.string(),
  totalFound: z.number(),
  totalEngageable: z.number(),
});

export const RedditReplyPostedSchema = z.object({
  postId: z.string(),
  subreddit: z.string(),
  replyId: z.string(),
});

// ---- Compatibility Agent signals ----

export const CompatibilityIntegrationConnectedSchema = z.object({
  integrationId: z.string(),
  platform: z.string(),
  status: z.string(),
});

export const CompatibilityHealthDegradedSchema = z.object({
  integrationId: z.string(),
  platform: z.string(),
  errorRate: z.number(),
  message: z.string(),
});

export const CompatibilitySchemaDriftSchema = z.object({
  integrationId: z.string(),
  platform: z.string(),
  fields: z.array(z.object({ field: z.string(), expected: z.string(), actual: z.string() })),
});

// ---- CMS signals ----

export const CmsChangeProposedSchema = z.object({
  changeId: z.string(),
  pageUrl: z.string(),
  changeSummary: z.string(),
  agentType: z.string(),
});

export const CmsChangePushedSchema = z.object({
  changeId: z.string(),
  pageUrl: z.string(),
  commitId: z.string().optional(),
});

// ---- Orchestrator signals ----

export const OrchestratorTaskAssignedSchema = z.object({
  taskId: z.string(),
  taskType: z.string(),
  agentType: z.string(),
  priority: z.string(),
});

export const OrchestratorTaskCompletedSchema = z.object({
  taskId: z.string(),
  taskType: z.string(),
  durationMs: z.number(),
});

export const OrchestratorTaskFailedSchema = z.object({
  taskId: z.string(),
  taskType: z.string(),
  error: z.string(),
  retryable: z.boolean(),
});

// ---------------------------------------------------------------------------
// Signal registry — maps signal type → Zod schema
// ---------------------------------------------------------------------------

export const SIGNAL_SCHEMAS = {
  // SEO
  'seo.keyword_discovered': SeoKeywordsUpdatedSchema,
  'seo.content_published': SeoContentPublishedSchema,
  'seo.ranking_changed': SeoRankingChangedSchema,
  'seo.competitor_analyzed': SeoCompetitorAnalyzedSchema,
  'seo.backlink_acquired': z.object({ url: z.string(), domain: z.string(), authority: z.number() }),

  // Ad
  'ad.campaign_launched': AdCampaignLaunchedSchema,
  'ad.budget_alert': AdBudgetAlertSchema,
  'ad.performance_update': AdPerformanceUpdateSchema,
  'ad.creative_needed': AdCreativeNeededSchema,

  // Creative
  'creative.asset_generated': CreativeAssetGeneratedSchema,
  'creative.test_completed': CreativeTestCompletedSchema,
  'creative.fatigue_detected': CreativeFatigueDetectedSchema,
  'creative.winner_found': CreativeWinnerFoundSchema,
  'creative.critic_evaluated': CreativeCriticEvaluatedSchema,

  // Data Nexus
  'data.insight_generated': DataInsightGeneratedSchema,
  'data.anomaly_detected': DataAnomalyDetectedSchema,
  'data.anomaly_escalated': DataAnomalyEscalatedSchema,
  'data.forecast_updated': DataForecastUpdatedSchema,
  'data.funnel_alert': DataFunnelAlertSchema,

  // AEO
  'aeo.citation_found': AeoCitationFoundSchema,
  'aeo.visibility_changed': AeoVisibilityChangedSchema,
  'aeo.entity_updated': AeoEntityUpdatedSchema,
  'aeo.probe_completed': AeoProbeCompletedSchema,

  // GEO
  'geo.ranking_dropped': GeoRankingDroppedSchema,
  'geo.citation_audit_completed': GeoCitationAuditCompletedSchema,

  // Social
  'social.mention_detected': SocialMentionDetectedSchema,
  'social.trend_detected': SocialTrendDetectedSchema,

  // Reddit
  'reddit.mention_detected': RedditMentionDetectedSchema,
  'reddit.reply_posted': RedditReplyPostedSchema,

  // Compatibility
  'compatibility.integration_connected': CompatibilityIntegrationConnectedSchema,
  'compatibility.integration_disconnected': CompatibilityIntegrationConnectedSchema,
  'compatibility.health_degraded': CompatibilityHealthDegradedSchema,
  'compatibility.schema_drift_detected': CompatibilitySchemaDriftSchema,
  'compatibility.onboarding_completed': z.object({ integrationId: z.string(), platform: z.string() }),

  // CMS
  'cms.change_proposed': CmsChangeProposedSchema,
  'cms.change_pushed': CmsChangePushedSchema,

  // Orchestrator
  'orchestrator.task_assigned': OrchestratorTaskAssignedSchema,
  'orchestrator.task_completed': OrchestratorTaskCompletedSchema,
  'orchestrator.task_failed': OrchestratorTaskFailedSchema,
} as const;

export type SignalType = keyof typeof SIGNAL_SCHEMAS;

/** Infer payload type from signal type */
export type SignalPayload<T extends SignalType> = z.infer<(typeof SIGNAL_SCHEMAS)[T]>;

// ---------------------------------------------------------------------------
// Typed signal envelope
// ---------------------------------------------------------------------------

export interface TypedSignal<T extends SignalType = SignalType> {
  id: string;
  tenantId: string;
  type: T;
  sourceAgent: AgentType | 'orchestrator' | string;
  targetAgent?: AgentType | 'broadcast' | string;
  payload: SignalPayload<T>;
  priority: TaskPriority;
  confidence: number;
  timestamp: string;
  correlationId?: string;
  /** Causal chain — list of signal IDs that triggered this signal */
  causedBy?: string[];
}

// ---------------------------------------------------------------------------
// Signal validation helper
// ---------------------------------------------------------------------------

/**
 * Validate a signal payload against its registered schema.
 * Returns the parsed (cleaned) payload or throws on invalid data.
 */
export function validateSignalPayload<T extends SignalType>(
  type: T,
  payload: unknown,
): SignalPayload<T> {
  const schema = SIGNAL_SCHEMAS[type];
  if (!schema) {
    throw new Error(`Unknown signal type: ${type}`);
  }
  return schema.parse(payload) as SignalPayload<T>;
}

/**
 * Safe validation — returns { success, data, error } instead of throwing.
 */
export function safeValidateSignalPayload<T extends SignalType>(
  type: T,
  payload: unknown,
): { success: true; data: SignalPayload<T> } | { success: false; error: z.ZodError } {
  const schema = SIGNAL_SCHEMAS[type];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([{ code: 'custom', message: `Unknown signal type: ${type}`, path: [] }]),
    };
  }
  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data as SignalPayload<T> };
  }
  return { success: false, error: result.error };
}

// ---------------------------------------------------------------------------
// Dependency declarations — which signals each agent listens for
// ---------------------------------------------------------------------------

export const AGENT_SIGNAL_SUBSCRIPTIONS: Record<string, SignalType[]> = {
  seo: [
    'aeo.citation_found',
    'aeo.visibility_changed',
    'data.anomaly_detected',
    'data.insight_generated',
    'creative.winner_found',
    'geo.ranking_dropped',
  ],
  ad: [
    'seo.keyword_discovered',
    'creative.asset_generated',
    'creative.test_completed',
    'creative.fatigue_detected',
    'data.anomaly_detected',
    'data.funnel_alert',
  ],
  creative: [
    'ad.creative_needed',
    'seo.content_published',
    'data.insight_generated',
  ],
  'data-nexus': [
    'seo.ranking_changed',
    'ad.performance_update',
    'social.mention_detected',
    'compatibility.integration_connected',
  ],
  aeo: [
    'seo.content_published',
    'seo.keyword_discovered',
    'geo.ranking_dropped',
  ],
  geo: [
    'seo.keyword_discovered',
    'aeo.citation_found',
    'data.anomaly_detected',
  ],
  social: [
    'seo.content_published',
    'data.insight_generated',
    'creative.asset_generated',
  ],
  reddit: [
    'seo.content_published',
    'data.insight_generated',
    'social.trend_detected',
  ],
  'content-writer': [
    'seo.keyword_discovered',
    'aeo.visibility_changed',
    'creative.winner_found',
    'data.insight_generated',
  ],
  compatibility: [
    'orchestrator.task_assigned',
  ],
};
