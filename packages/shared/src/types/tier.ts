import type { AgentType } from './agent.js';

/** Subscription plan tiers */
export type SubscriptionTier = 'launchpad' | 'growth' | 'enterprise';

/** All possible assistant tool names */
export type AssistantToolName =
  // Navigation
  | 'navigate'
  | 'openModal'
  | 'closeModal'
  | 'setDateRange'
  | 'setFilter'
  // Data retrieval
  | 'getAnalytics'
  | 'getCampaigns'
  | 'getCreatives'
  | 'getAgentStatus'
  | 'getIntegrationHealth'
  | 'getSeoRankings'
  | 'getAeoCitations'
  | 'getFunnelData'
  // Actions
  | 'createCampaign'
  | 'generateCreative'
  | 'pauseCampaign'
  | 'resumeCampaign'
  | 'adjustBudget'
  | 'triggerSeoAudit'
  | 'triggerAeoScan'
  | 'generateReport'
  | 'connectIntegration'
  | 'reconnectIntegration'
  // Display
  | 'showChart'
  | 'showTable'
  | 'showCreativePreview'
  | 'showAlert'
  | 'showUpgradePrompt'
  // Explanation
  | 'explainMetric'
  | 'explainAgent'
  | 'suggestAction'
  // New capability tools
  | 'webSearch'
  | 'generateContent'
  | 'getRedditMentions'
  | 'getSocialMentions'
  | 'getGeoRankings';

/** Feature names that can be gated */
export type FeatureName =
  | 'basic_analytics'
  | 'advanced_analytics'
  | 'seo_content'
  | 'ad_campaigns'
  | 'creative_generation'
  | 'basic_funnel'
  | 'aeo_basic'
  | 'aeo_advanced'
  | 'multi_touch_attribution'
  | 'funnel_experiments'
  | 'competitor_monitoring'
  | 'email_campaigns'
  | 'custom_reports'
  | 'white_label'
  | 'dedicated_sla'
  | 'custom_model_training'
  | 'api_access'
  | 'reddit_monitoring'
  | 'social_listening'
  | 'content_writer'
  | 'geo_seo'
  | 'real_time_search'
  | 'multi_model_llm'
  | 'file_upload_analysis';

/** Capability definition for a single tier */
export interface TierCapabilities {
  agents: AgentType[];
  maxCampaigns: number;
  maxCreativesPerMonth: number;
  features: FeatureName[];
  assistantTools: AssistantToolName[];
  excluded: string[];
}

/** Result of a tier gate check */
export interface TierGateResult {
  allowed: boolean;
  reason?: string;
  requiredTier?: SubscriptionTier;
  currentTier: SubscriptionTier;
}

/** Report types the assistant can generate */
export type ReportType =
  | 'campaign_performance'
  | 'seo_audit'
  | 'creative_analysis'
  | 'funnel_analysis'
  | 'aeo_citations'
  | 'executive_summary';
