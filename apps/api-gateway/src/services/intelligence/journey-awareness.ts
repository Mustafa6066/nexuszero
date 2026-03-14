/**
 * Layer 2 — Journey Awareness
 *
 * Tracks where the customer is in their platform lifecycle:
 * onboarding progress, feature adoption breadth, key milestones,
 * and the current journey phase that shapes how NexusAI should talk to them.
 */

import {
  withTenantDb,
  tenants,
  campaigns,
  creatives,
  integrations,
  agents,
  agentTasks,
  assistantSessions,
  assistantMessages,
} from '@nexuszero/db';
import { eq, and, sql, count, desc, gte } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────────────

export type JourneyPhase =
  | 'onboarding'    // Still going through setup
  | 'exploring'     // Setup done, trying things out
  | 'active'        // Running campaigns, generating creatives
  | 'optimizing'    // Refining performance, using advanced features
  | 'scaling';      // Heavy usage, multi-channel, high volume

export interface FeatureAdoption {
  feature: string;
  adopted: boolean;
}

export interface Milestone {
  name: string;
  achieved: boolean;
}

export interface JourneyAwareness {
  /** Current onboarding state from tenant record */
  onboardingState: string;
  /** Percent onboarding complete (0-100) */
  onboardingProgress: number;
  /** High-level lifecycle phase */
  journeyPhase: JourneyPhase;
  /** Days since first activity (campaign, creative, or assistant msg) */
  daysSinceFirstActivity: number | null;
  /** Feature adoption checklist */
  featureAdoption: FeatureAdoption[];
  /** Key milestone achievements */
  milestones: Milestone[];
  /** Recommended next actions based on journey state */
  nextActions: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const ONBOARDING_ORDERED: string[] = [
  'created', 'oauth_connecting', 'oauth_connected', 'auditing',
  'audit_complete', 'provisioning', 'provisioned', 'strategy_generating',
  'strategy_ready', 'going_live', 'active',
];

// ── Builder ────────────────────────────────────────────────────────────────

export async function buildJourneyAwareness(tenantId: string): Promise<JourneyAwareness> {
  return withTenantDb(tenantId, async (db) => {
    const [
      tenantRow,
      campaignStats,
      creativeStats,
      integrationCount,
      agentCount,
      taskCount,
      sessionStats,
      firstActivity,
    ] = await Promise.all([
      db.select({
        onboardingState: tenants.onboardingState,
        createdAt: tenants.createdAt,
      }).from(tenants).where(eq(tenants.id, tenantId)).limit(1).then((r) => r[0]),

      db.select({
        total: count(),
        active: sql<number>`count(*) filter (where status = 'active')`,
        hasMultipleTypes: sql<boolean>`count(distinct type) > 1`,
        hasMultiplePlatforms: sql<boolean>`count(distinct platform) filter (where platform is not null) > 1`,
      }).from(campaigns).where(eq(campaigns.tenantId, tenantId)).then((r) => r[0]),

      db.select({ total: count() })
        .from(creatives).where(eq(creatives.tenantId, tenantId)).then((r) => r[0]),

      db.select({ cnt: count() })
        .from(integrations)
        .where(and(eq(integrations.tenantId, tenantId), eq(integrations.status, 'connected' as never)))
        .then((r) => r[0]?.cnt ?? 0),

      db.select({ cnt: count() })
        .from(agents).where(eq(agents.tenantId, tenantId))
        .then((r) => r[0]?.cnt ?? 0),

      db.select({ cnt: count() })
        .from(agentTasks)
        .where(and(eq(agentTasks.tenantId, tenantId), eq(agentTasks.status, 'completed' as never)))
        .then((r) => r[0]?.cnt ?? 0),

      db.select({ total: count() })
        .from(assistantSessions).where(eq(assistantSessions.tenantId, tenantId))
        .then((r) => r[0]),

      // Earliest assistant message or campaign as proxy for first activity
      db.select({ earliest: sql<Date>`least(
        (select min(created_at) from campaigns where tenant_id = ${tenantId}),
        (select min(created_at) from assistant_messages where tenant_id = ${tenantId})
      )` }).then((r) => r[0]?.earliest),
    ]);

    if (!tenantRow) throw new Error('Tenant not found');

    const obState = tenantRow.onboardingState;
    const obIdx = ONBOARDING_ORDERED.indexOf(obState);
    const onboardingProgress = obState === 'active' || obState === 'live'
      ? 100
      : obIdx === -1 ? 0 : Math.round((obIdx / (ONBOARDING_ORDERED.length - 1)) * 100);

    const totalCampaigns = Number(campaignStats?.total ?? 0);
    const activeCampaigns = Number(campaignStats?.active ?? 0);
    const totalCreatives = Number(creativeStats?.total ?? 0);
    const intCount = Number(integrationCount);
    const agCount = Number(agentCount);
    const tskCount = Number(taskCount);
    const sessionCount = Number(sessionStats?.total ?? 0);
    const hasMultipleTypes = campaignStats?.hasMultipleTypes ?? false;
    const hasMultiplePlatforms = campaignStats?.hasMultiplePlatforms ?? false;

    const daysSinceFirstActivity = firstActivity
      ? Math.floor((Date.now() - new Date(firstActivity).getTime()) / (24 * 60 * 60 * 1000))
      : null;

    // ── Feature adoption checklist ──
    const featureAdoption: FeatureAdoption[] = [
      { feature: 'Connected an integration', adopted: intCount > 0 },
      { feature: 'Created a campaign', adopted: totalCampaigns > 0 },
      { feature: 'Launched an active campaign', adopted: activeCampaigns > 0 },
      { feature: 'Generated a creative', adopted: totalCreatives > 0 },
      { feature: 'Used the AI assistant', adopted: sessionCount > 0 },
      { feature: 'Multiple campaign types', adopted: hasMultipleTypes },
      { feature: 'Multi-platform advertising', adopted: hasMultiplePlatforms },
      { feature: 'AI agents running', adopted: agCount > 0 },
      { feature: 'Completed agent tasks', adopted: tskCount > 0 },
    ];

    const adoptedCount = featureAdoption.filter((f) => f.adopted).length;

    // ── Milestones ──
    const milestones: Milestone[] = [
      { name: 'Completed onboarding', achieved: onboardingProgress === 100 },
      { name: 'First integration connected', achieved: intCount > 0 },
      { name: 'First campaign created', achieved: totalCampaigns > 0 },
      { name: 'First creative generated', achieved: totalCreatives > 0 },
      { name: '5+ campaigns running', achieved: totalCampaigns >= 5 },
      { name: '10+ creatives generated', achieved: totalCreatives >= 10 },
      { name: 'Multi-channel marketer', achieved: hasMultipleTypes },
      { name: 'Power user (20+ assistant sessions)', achieved: sessionCount >= 20 },
    ];

    // ── Journey phase ──
    const journeyPhase = determinePhase(
      onboardingProgress, adoptedCount, totalCampaigns, activeCampaigns,
      hasMultiplePlatforms, hasMultipleTypes, tskCount,
    );

    // ── Next recommended actions ──
    const nextActions = buildNextActions(
      journeyPhase, featureAdoption, onboardingProgress,
      intCount, totalCampaigns, totalCreatives, sessionCount,
    );

    return {
      onboardingState: obState,
      onboardingProgress,
      journeyPhase,
      daysSinceFirstActivity,
      featureAdoption,
      milestones,
      nextActions,
    };
  });
}

// ── Private helpers ────────────────────────────────────────────────────────

function determinePhase(
  onboardingPct: number,
  adoptedFeatures: number,
  totalCampaigns: number,
  activeCampaigns: number,
  multiPlatform: boolean,
  multiType: boolean,
  completedTasks: number,
): JourneyPhase {
  if (onboardingPct < 100) return 'onboarding';
  if (totalCampaigns === 0 || adoptedFeatures <= 3) return 'exploring';
  if (multiPlatform && multiType && completedTasks >= 20) return 'scaling';
  if (activeCampaigns >= 3 && completedTasks >= 5) return 'optimizing';
  return 'active';
}

function buildNextActions(
  phase: JourneyPhase,
  features: FeatureAdoption[],
  onboardingPct: number,
  intCount: number,
  campaigns: number,
  creatives: number,
  sessions: number,
): string[] {
  const actions: string[] = [];
  const notAdopted = features.filter((f) => !f.adopted);

  switch (phase) {
    case 'onboarding':
      actions.push('Complete the onboarding wizard to unlock all platform features');
      if (intCount === 0) actions.push('Connect your first marketing platform (Google Ads, Meta, etc.)');
      break;

    case 'exploring':
      if (campaigns === 0) actions.push('Create your first marketing campaign');
      if (creatives === 0) actions.push('Try the AI creative generator to build ad assets');
      if (sessions <= 1) actions.push('Ask NexusAI for a marketing strategy recommendation');
      if (intCount < 2) actions.push('Connect additional integrations for richer analytics');
      break;

    case 'active':
      actions.push('Review campaign performance and let NexusAI suggest optimizations');
      if (notAdopted.length > 0) actions.push(`Explore: ${notAdopted.slice(0, 2).map((f) => f.feature).join(', ')}`);
      actions.push('Set up automated agent tasks for hands-free optimization');
      break;

    case 'optimizing':
      actions.push('Run an A/B test on your top-performing creatives');
      actions.push('Ask NexusAI to analyze cross-channel attribution');
      actions.push('Review funnel analysis to reduce drop-off rates');
      break;

    case 'scaling':
      actions.push('Evaluate upgrading your plan for higher campaign limits');
      actions.push('Enable AEO scanning to track AI engine citations');
      actions.push('Generate an executive summary report for stakeholders');
      break;
  }

  return actions.slice(0, 3);
}
