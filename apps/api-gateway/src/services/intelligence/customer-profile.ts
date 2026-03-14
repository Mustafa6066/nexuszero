/**
 * Layer 1 — Customer Profile
 *
 * Builds a rich understanding of who the customer is:
 * marketing maturity, budget scale, channel preferences,
 * team size indicators, and platform tenure.
 */

import {
  withTenantDb,
  tenants,
  users,
  campaigns,
  integrations,
  creatives,
} from '@nexuszero/db';
import { eq, and, sql, count } from 'drizzle-orm';
import type { SubscriptionTier } from '@nexuszero/shared';

// ── Types ──────────────────────────────────────────────────────────────────

export type MarketingMaturity = 'beginner' | 'intermediate' | 'advanced';
export type BudgetScale = 'minimal' | 'moderate' | 'significant' | 'enterprise';

export interface CustomerProfile {
  /** Days since tenant was created */
  platformTenureDays: number;
  /** Current subscription plan */
  tier: SubscriptionTier;
  /** Number of team members */
  teamSize: number;
  /** Overall marketing maturity assessment */
  maturity: MarketingMaturity;
  /** Budget scale category */
  budgetScale: BudgetScale;
  /** Total campaigns ever created */
  totalCampaigns: number;
  /** Currently active campaigns */
  activeCampaigns: number;
  /** Campaign types the customer uses */
  campaignTypes: string[];
  /** Ad platforms actively used */
  activePlatforms: string[];
  /** Connected integration platforms */
  connectedIntegrations: string[];
  /** Number of creative assets generated */
  totalCreatives: number;
  /** Total monthly spend (last 30 days from campaigns) */
  recentSpend: number;
  /** Total monthly revenue (last 30 days from campaigns) */
  recentRevenue: number;
  /** Best performing ROAS across campaigns */
  bestRoas: number;
}

// ── Builder ────────────────────────────────────────────────────────────────

export async function buildCustomerProfile(tenantId: string): Promise<CustomerProfile> {
  return withTenantDb(tenantId, async (db) => {
    // Parallel queries for speed
    const [tenantRow, teamCount, campaignStats, integrationRows, creativeCount] =
      await Promise.all([
        db
          .select({
            plan: tenants.plan,
            createdAt: tenants.createdAt,
          })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1)
          .then((r) => r[0]),

        db
          .select({ cnt: count() })
          .from(users)
          .where(eq(users.tenantId, tenantId))
          .then((r) => r[0]?.cnt ?? 0),

        db
          .select({
            total: count(),
            active: sql<number>`count(*) filter (where status = 'active')`,
            types: sql<string[]>`array_agg(distinct type)`,
            platforms: sql<string[]>`array_agg(distinct platform) filter (where platform is not null)`,
            totalSpend: sql<number>`coalesce(sum(spend), 0)::real`,
            totalRevenue: sql<number>`coalesce(sum(revenue), 0)::real`,
            maxRoas: sql<number>`coalesce(max(roas), 0)::real`,
          })
          .from(campaigns)
          .where(eq(campaigns.tenantId, tenantId))
          .then((r) => r[0]),

        db
          .select({ platform: integrations.platform })
          .from(integrations)
          .where(
            and(
              eq(integrations.tenantId, tenantId),
              eq(integrations.status, 'connected' as never),
            ),
          ),

        db
          .select({ cnt: count() })
          .from(creatives)
          .where(eq(creatives.tenantId, tenantId))
          .then((r) => r[0]?.cnt ?? 0),
      ]);

    if (!tenantRow) throw new Error('Tenant not found');

    const tier = tenantRow.plan as SubscriptionTier;
    const platformTenureDays = Math.floor(
      (Date.now() - new Date(tenantRow.createdAt).getTime()) / (24 * 60 * 60 * 1000),
    );
    const totalCampaigns = Number(campaignStats?.total ?? 0);
    const activeCampaigns = Number(campaignStats?.active ?? 0);
    const recentSpend = Number(campaignStats?.totalSpend ?? 0);
    const recentRevenue = Number(campaignStats?.totalRevenue ?? 0);
    const bestRoas = Number(campaignStats?.maxRoas ?? 0);
    const campaignTypes = (campaignStats?.types ?? []).filter(Boolean);
    const activePlatforms = (campaignStats?.platforms ?? []).filter(Boolean);
    const connectedIntegrations = integrationRows.map((i) => i.platform);
    const teamSize = Number(teamCount);
    const totalCreatives = Number(creativeCount);

    return {
      platformTenureDays,
      tier,
      teamSize,
      maturity: assessMaturity(totalCampaigns, campaignTypes, connectedIntegrations, recentSpend),
      budgetScale: assessBudgetScale(recentSpend),
      totalCampaigns,
      activeCampaigns,
      campaignTypes,
      activePlatforms,
      connectedIntegrations,
      totalCreatives,
      recentSpend,
      recentRevenue,
      bestRoas,
    };
  });
}

// ── Private helpers ────────────────────────────────────────────────────────

function assessMaturity(
  campaignCount: number,
  campaignTypes: string[],
  integrationsConnected: string[],
  spend: number,
): MarketingMaturity {
  let score = 0;
  if (campaignCount >= 10) score += 2;
  else if (campaignCount >= 3) score += 1;
  if (campaignTypes.length >= 3) score += 2;
  else if (campaignTypes.length >= 2) score += 1;
  if (integrationsConnected.length >= 4) score += 2;
  else if (integrationsConnected.length >= 2) score += 1;
  if (spend >= 10_000) score += 2;
  else if (spend >= 1_000) score += 1;

  if (score >= 6) return 'advanced';
  if (score >= 3) return 'intermediate';
  return 'beginner';
}

function assessBudgetScale(spend: number): BudgetScale {
  if (spend >= 50_000) return 'enterprise';
  if (spend >= 10_000) return 'significant';
  if (spend >= 1_000) return 'moderate';
  return 'minimal';
}
