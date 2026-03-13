import {
  TIER_CAPABILITIES,
  isToolAllowed,
  getRequiredTier,
  TIER_DISPLAY_NAMES,
} from '@nexuszero/shared';
import type { SubscriptionTier, AssistantToolName, TierGateResult, FeatureName } from '@nexuszero/shared';

/**
 * Tier gate service — validates whether a tool call or feature
 * is available for the tenant's subscription tier.
 */

/** Check if a specific assistant tool is allowed for this tier */
export function gateTool(tier: SubscriptionTier, tool: AssistantToolName): TierGateResult {
  if (isToolAllowed(tier, tool)) {
    return { allowed: true, currentTier: tier };
  }
  const requiredTier = getRequiredTier(tool);
  return {
    allowed: false,
    currentTier: tier,
    requiredTier,
    reason: `The "${tool}" capability requires the ${TIER_DISPLAY_NAMES[requiredTier]} plan. You're currently on ${TIER_DISPLAY_NAMES[tier]}.`,
  };
}

/** Check if a feature is available for this tier */
export function gateFeature(tier: SubscriptionTier, feature: FeatureName): TierGateResult {
  const capabilities = TIER_CAPABILITIES[tier];
  if (capabilities.features.includes(feature)) {
    return { allowed: true, currentTier: tier };
  }
  // Find which tier unlocks this feature
  const tiers: SubscriptionTier[] = ['launchpad', 'growth', 'enterprise'];
  const requiredTier = tiers.find((t) => TIER_CAPABILITIES[t].features.includes(feature)) ?? 'enterprise';
  return {
    allowed: false,
    currentTier: tier,
    requiredTier,
    reason: `${feature.replace(/_/g, ' ')} is available on the ${TIER_DISPLAY_NAMES[requiredTier]} plan.`,
  };
}

/** Check campaign limits */
export function gateCampaignCreation(tier: SubscriptionTier, currentCount: number): TierGateResult {
  const max = TIER_CAPABILITIES[tier].maxCampaigns;
  if (currentCount < max) {
    return { allowed: true, currentTier: tier };
  }
  return {
    allowed: false,
    currentTier: tier,
    requiredTier: tier === 'launchpad' ? 'growth' : 'enterprise',
    reason: `You've reached the ${max} campaign limit on your ${TIER_DISPLAY_NAMES[tier]} plan.`,
  };
}

/** Check creative generation limits */
export function gateCreativeGeneration(tier: SubscriptionTier, monthlyCount: number): TierGateResult {
  const max = TIER_CAPABILITIES[tier].maxCreativesPerMonth;
  if (monthlyCount < max) {
    return { allowed: true, currentTier: tier };
  }
  return {
    allowed: false,
    currentTier: tier,
    requiredTier: tier === 'launchpad' ? 'growth' : 'enterprise',
    reason: `You've used ${monthlyCount}/${max} creative generations this month on ${TIER_DISPLAY_NAMES[tier]}.`,
  };
}

/** Get the list of tools available for a tier (for Claude's tool definitions) */
export function getAvailableTools(tier: SubscriptionTier): AssistantToolName[] {
  return TIER_CAPABILITIES[tier].assistantTools;
}
