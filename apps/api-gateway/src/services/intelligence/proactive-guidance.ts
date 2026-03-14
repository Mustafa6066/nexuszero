/**
 * Layer 4 — Proactive Guidance
 *
 * Synthesizes outputs from the other three layers to produce
 * contextual tips, feature-discovery nudges, performance alerts,
 * and health warnings that NexusAI can weave into conversation.
 */

import {
  withTenantDb,
  campaigns,
  integrations,
  agents,
  creatives,
} from '@nexuszero/db';
import { eq, and, sql, lt } from 'drizzle-orm';
import type { SubscriptionTier } from '@nexuszero/shared';
import { TIER_CAPABILITIES } from '@nexuszero/shared';
import type { CustomerProfile } from './customer-profile.js';
import type { JourneyAwareness, JourneyPhase } from './journey-awareness.js';
import type { BehavioralIntelligence, SkillLevel } from './behavioral-intel.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProactiveGuidance {
  /** Contextual tips tailored to the customer's current situation */
  tips: string[];
  /** Features the customer hasn't tried yet but would benefit from */
  featureDiscovery: string[];
  /** Performance-related alerts and opportunities */
  performanceAlerts: string[];
  /** Integration or agent health warnings */
  healthWarnings: string[];
  /** Tone/style directive for NexusAI based on the customer's profile */
  communicationStyle: string;
}

// ── Builder ────────────────────────────────────────────────────────────────

export async function buildProactiveGuidance(
  tenantId: string,
  profile: CustomerProfile,
  journey: JourneyAwareness,
  behavior: BehavioralIntelligence,
): Promise<ProactiveGuidance> {
  // Fetch live health data for real-time alerts
  const healthData = await fetchHealthData(tenantId);

  const tips = buildTips(profile, journey, behavior);
  const featureDiscovery = buildFeatureDiscovery(profile, journey, behavior);
  const performanceAlerts = buildPerformanceAlerts(profile, healthData);
  const healthWarnings = buildHealthWarnings(healthData);
  const communicationStyle = determineCommunicationStyle(profile, journey, behavior);

  return {
    tips,
    featureDiscovery,
    performanceAlerts,
    healthWarnings,
    communicationStyle,
  };
}

// ── Health data fetch ──────────────────────────────────────────────────────

interface HealthData {
  degradedIntegrations: { platform: string; healthScore: number }[];
  staleAgents: { type: string; minutesSinceHeartbeat: number }[];
  pausedCampaigns: number;
  lowPerformingCampaigns: { name: string; roas: number }[];
  expiringTokens: { platform: string; hoursUntilExpiry: number }[];
}

async function fetchHealthData(tenantId: string): Promise<HealthData> {
  return withTenantDb(tenantId, async (db) => {
    const [degraded, stale, paused, lowPerf, expiring] = await Promise.all([
      // Degraded integrations
      db.select({ platform: integrations.platform, healthScore: integrations.healthScore })
        .from(integrations)
        .where(and(eq(integrations.tenantId, tenantId), lt(integrations.healthScore, 70))),

      // Agents that haven't sent a heartbeat in 10+ minutes
      db.select({
        type: agents.type,
        minutesSinceHeartbeat: sql<number>`extract(epoch from now() - last_heartbeat)::int / 60`,
      })
        .from(agents)
        .where(
          and(
            eq(agents.tenantId, tenantId),
            sql`last_heartbeat < now() - interval '10 minutes'`,
          ),
        ) as unknown as Promise<{ type: string; minutesSinceHeartbeat: number }[]>,

      // Count of paused campaigns
      db.select({ cnt: sql<number>`count(*)::int` })
        .from(campaigns)
        .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.status, 'paused' as never)))
        .then((r) => Number(r[0]?.cnt ?? 0)),

      // Campaigns with ROAS < 1 (losing money)
      db.select({ name: campaigns.name, roas: campaigns.roas })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.tenantId, tenantId),
            eq(campaigns.status, 'active' as never),
            lt(campaigns.roas, 1),
            sql`spend > 100`, // Only flag if meaningful spend
          ),
        ),

      // Tokens expiring in < 48 hours
      db.select({
        platform: integrations.platform,
        hoursUntilExpiry: sql<number>`extract(epoch from token_expires_at - now())::int / 3600`,
      })
        .from(integrations)
        .where(
          and(
            eq(integrations.tenantId, tenantId),
            sql`token_expires_at < now() + interval '48 hours'`,
            sql`token_expires_at > now()`,
          ),
        ) as unknown as Promise<{ platform: string; hoursUntilExpiry: number }[]>,
    ]);

    return {
      degradedIntegrations: degraded,
      staleAgents: stale,
      pausedCampaigns: paused,
      lowPerformingCampaigns: lowPerf,
      expiringTokens: expiring,
    };
  });
}

// ── Tip builders ───────────────────────────────────────────────────────────

function buildTips(
  profile: CustomerProfile,
  journey: JourneyAwareness,
  behavior: BehavioralIntelligence,
): string[] {
  const tips: string[] = [];

  // Beginner-specific guidance
  if (behavior.skillLevel === 'beginner') {
    if (profile.totalCampaigns === 0) {
      tips.push('This customer has never created a campaign. Walk them through it step by step when they ask.');
    }
    tips.push('Keep explanations simple and jargon-free. Offer to explain metrics when presenting data.');
  }

  // Journey-phase tips
  if (journey.journeyPhase === 'exploring') {
    tips.push('Customer is still exploring. Proactively suggest features and demonstrate capabilities.');
  } else if (journey.journeyPhase === 'optimizing') {
    tips.push('Customer is in optimization mode. Lead with performance insights and improvement suggestions.');
  } else if (journey.journeyPhase === 'scaling') {
    tips.push('Customer is scaling. Focus on efficiency, automation, and cross-channel synergies.');
  }

  // Re-engagement for dormant users
  if (behavior.engagementLevel === 'dormant' || behavior.engagementLevel === 'low') {
    tips.push('Customer engagement is low. Be extra welcoming; summarize what they may have missed and suggest a quick win.');
  }

  // Pain point awareness
  for (const pain of behavior.painPoints) {
    tips.push(`Awareness: ${pain}`);
  }

  return tips.slice(0, 4);
}

function buildFeatureDiscovery(
  profile: CustomerProfile,
  journey: JourneyAwareness,
  behavior: BehavioralIntelligence,
): string[] {
  const discoveries: string[] = [];
  const adoptedSet = new Set(
    journey.featureAdoption.filter((f) => f.adopted).map((f) => f.feature),
  );

  // Suggest charts/tables if they browse analytics but never ask for them
  const usesAnalytics = behavior.topTools.some((t) => t.tool === 'getAnalytics');
  const usesCharts = behavior.topTools.some((t) => t.tool === 'showChart');
  if (usesAnalytics && !usesCharts) {
    discoveries.push('Customer views analytics but hasn\'t seen inline charts. Offer to visualize data with showChart.');
  }

  // Suggest creative generation if they run ads but never generated creatives
  if (profile.activeCampaigns > 0 && profile.totalCreatives === 0) {
    discoveries.push('Customer runs campaigns but hasn\'t used AI creative generation. Mention it when discussing ad performance.');
  }

  // Suggest reports if they're intermediate+
  const usesReports = behavior.topTools.some((t) => t.tool === 'generateReport');
  if (behavior.skillLevel !== 'beginner' && !usesReports) {
    discoveries.push('Customer hasn\'t used report generation. Offer to generate a performance summary.');
  }

  // Suggest AEO if on growth/enterprise and not adopted
  if (
    (profile.tier === 'growth' || profile.tier === 'enterprise') &&
    !behavior.topTools.some((t) => t.tool === 'getAeoCitations' || t.tool === 'triggerAeoScan')
  ) {
    discoveries.push('AEO (AI Engine Optimization) is available on this plan but unused. Mention it when discussing visibility.');
  }

  // Suggest funnel analysis
  if (profile.activeCampaigns >= 2 && !behavior.topTools.some((t) => t.tool === 'getFunnelData')) {
    discoveries.push('Funnel analysis is available. Suggest it when customer discusses conversions or drop-offs.');
  }

  return discoveries.slice(0, 3);
}

function buildPerformanceAlerts(
  profile: CustomerProfile,
  health: HealthData,
): string[] {
  const alerts: string[] = [];

  for (const c of health.lowPerformingCampaigns.slice(0, 2)) {
    alerts.push(
      `Campaign "${c.name}" has ROAS ${c.roas.toFixed(2)} (below 1.0). Suggest reviewing targeting or pausing.`,
    );
  }

  if (health.pausedCampaigns > 0) {
    alerts.push(
      `${health.pausedCampaigns} campaign(s) are paused. Ask if they should be resumed or archived.`,
    );
  }

  if (profile.recentSpend > 0 && profile.recentRevenue === 0) {
    alerts.push('Customer is spending on ads but showing zero revenue. Suggest reviewing conversion tracking.');
  }

  return alerts.slice(0, 3);
}

function buildHealthWarnings(health: HealthData): string[] {
  const warnings: string[] = [];

  for (const i of health.degradedIntegrations.slice(0, 2)) {
    warnings.push(
      `${i.platform} integration health is ${i.healthScore}%. Offer to reconnect or troubleshoot.`,
    );
  }

  for (const a of health.staleAgents.slice(0, 2)) {
    warnings.push(
      `${a.type} agent hasn't sent a heartbeat in ${a.minutesSinceHeartbeat} minutes. May need attention.`,
    );
  }

  for (const t of health.expiringTokens.slice(0, 2)) {
    warnings.push(
      `${t.platform} OAuth token expires in ${t.hoursUntilExpiry} hours. Offer to help reconnect.`,
    );
  }

  return warnings.slice(0, 3);
}

// ── Communication style ────────────────────────────────────────────────────

function determineCommunicationStyle(
  profile: CustomerProfile,
  journey: JourneyAwareness,
  behavior: BehavioralIntelligence,
): string {
  const parts: string[] = [];

  // Skill-adapted tone
  switch (behavior.skillLevel) {
    case 'beginner':
      parts.push('Use simple, approachable language. Avoid jargon or define it inline. Offer step-by-step guidance.');
      break;
    case 'intermediate':
      parts.push('Use standard marketing terminology. Be concise but explain advanced concepts when they appear.');
      break;
    case 'expert':
      parts.push('Be direct and data-driven. Skip basic explanations. Lead with numbers and actionable insights.');
      break;
  }

  // Engagement-adapted warmth
  if (behavior.engagementLevel === 'dormant' || behavior.engagementLevel === 'low') {
    parts.push('Be warm and welcoming — this user doesn\'t visit often. Summarize key changes since their last session.');
  } else if (behavior.engagementLevel === 'power_user') {
    parts.push('This is a power user — be efficient and skip introductions. They know the platform well.');
  }

  // Journey-phase communication
  if (journey.journeyPhase === 'onboarding') {
    parts.push('Focus on helping them complete setup. Celebrate each completed step.');
  }

  return parts.join(' ');
}
