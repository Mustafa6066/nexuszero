import type { SubscriptionTier, TierCapabilities, AssistantToolName } from '../types/tier.js';

/** Complete capability mapping for each subscription tier */
export const TIER_CAPABILITIES: Record<SubscriptionTier, TierCapabilities> = {
  launchpad: {
    agents: ['seo', 'ad', 'creative', 'data-nexus', 'compatibility'],
    maxCampaigns: 10,
    maxCreativesPerMonth: 500,
    features: [
      'basic_analytics',
      'seo_content',
      'ad_campaigns',
      'creative_generation',
      'basic_funnel',
    ],
    assistantTools: [
      'navigate', 'openModal', 'closeModal', 'setDateRange', 'setFilter',
      'getAnalytics', 'getCampaigns', 'getCreatives', 'getAgentStatus',
      'getIntegrationHealth', 'getSeoRankings', 'getFunnelData',
      'createCampaign', 'generateCreative', 'pauseCampaign', 'resumeCampaign',
      'showChart', 'showTable', 'showCreativePreview', 'showAlert',
      'explainMetric', 'explainAgent', 'suggestAction',
    ],
    excluded: [
      'aeo_basic', 'aeo_advanced', 'competitor_monitoring', 'advanced_analytics',
      'multi_touch_attribution', 'custom_reports', 'funnel_experiments',
      'email_campaigns', 'white_label', 'dedicated_sla', 'custom_model_training', 'api_access',
    ],
  },
  growth: {
    agents: ['seo', 'ad', 'creative', 'data-nexus', 'compatibility', 'aeo'],
    maxCampaigns: 50,
    maxCreativesPerMonth: 2000,
    features: [
      'basic_analytics', 'advanced_analytics',
      'seo_content', 'ad_campaigns', 'creative_generation',
      'basic_funnel', 'funnel_experiments',
      'aeo_basic', 'multi_touch_attribution',
      'competitor_monitoring', 'email_campaigns', 'custom_reports',
    ],
    assistantTools: [
      // All launchpad tools
      'navigate', 'openModal', 'closeModal', 'setDateRange', 'setFilter',
      'getAnalytics', 'getCampaigns', 'getCreatives', 'getAgentStatus',
      'getIntegrationHealth', 'getSeoRankings', 'getFunnelData',
      'createCampaign', 'generateCreative', 'pauseCampaign', 'resumeCampaign',
      'showChart', 'showTable', 'showCreativePreview', 'showAlert',
      'explainMetric', 'explainAgent', 'suggestAction',
      // Growth additions
      'triggerAeoScan', 'getAeoCitations', 'generateReport',
      'adjustBudget', 'triggerSeoAudit', 'connectIntegration', 'reconnectIntegration',
      'showUpgradePrompt',
    ],
    excluded: [
      'aeo_advanced', 'white_label', 'dedicated_sla', 'custom_model_training', 'api_access',
    ],
  },
  enterprise: {
    agents: ['seo', 'ad', 'creative', 'data-nexus', 'compatibility', 'aeo'],
    maxCampaigns: Infinity,
    maxCreativesPerMonth: Infinity,
    features: [
      'basic_analytics', 'advanced_analytics',
      'seo_content', 'ad_campaigns', 'creative_generation',
      'basic_funnel', 'funnel_experiments',
      'aeo_basic', 'aeo_advanced', 'multi_touch_attribution',
      'competitor_monitoring', 'email_campaigns', 'custom_reports',
      'white_label', 'dedicated_sla', 'custom_model_training', 'api_access',
    ],
    assistantTools: [
      'navigate', 'openModal', 'closeModal', 'setDateRange', 'setFilter',
      'getAnalytics', 'getCampaigns', 'getCreatives', 'getAgentStatus',
      'getIntegrationHealth', 'getSeoRankings', 'getAeoCitations', 'getFunnelData',
      'createCampaign', 'generateCreative', 'pauseCampaign', 'resumeCampaign',
      'adjustBudget', 'triggerSeoAudit', 'triggerAeoScan', 'generateReport',
      'connectIntegration', 'reconnectIntegration',
      'showChart', 'showTable', 'showCreativePreview', 'showAlert', 'showUpgradePrompt',
      'explainMetric', 'explainAgent', 'suggestAction',
    ],
    excluded: [],
  },
};

/** Get capabilities for a tier */
export function getTierCapabilities(tier: SubscriptionTier): TierCapabilities {
  return TIER_CAPABILITIES[tier];
}

/** Check if a tool is allowed for a tier */
export function isToolAllowed(tier: SubscriptionTier, tool: AssistantToolName): boolean {
  return TIER_CAPABILITIES[tier].assistantTools.includes(tool);
}

/** Get the minimum tier required for a tool */
export function getRequiredTier(tool: AssistantToolName): SubscriptionTier {
  if (TIER_CAPABILITIES.launchpad.assistantTools.includes(tool)) return 'launchpad';
  if (TIER_CAPABILITIES.growth.assistantTools.includes(tool)) return 'growth';
  return 'enterprise';
}

/** Tier display names */
export const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  launchpad: 'Launchpad',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

/** Tier pricing (monthly) */
export const TIER_PRICING: Record<SubscriptionTier, number> = {
  launchpad: 299,
  growth: 799,
  enterprise: 2499,
};
