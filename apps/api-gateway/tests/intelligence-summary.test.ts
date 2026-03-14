import { describe, expect, it } from 'vitest';
import { buildDashboardIntelligenceSummary } from '../src/services/intelligence/dashboard-summary.js';

function createIntel(overrides: Record<string, any> = {}) {
  return {
    profile: {
      platformTenureDays: 10,
      tier: 'growth',
      teamSize: 3,
      maturity: 'intermediate',
      budgetScale: 'moderate',
      totalCampaigns: 0,
      activeCampaigns: 0,
      campaignTypes: [],
      activePlatforms: [],
      connectedIntegrations: [],
      totalCreatives: 0,
      recentSpend: 0,
      recentRevenue: 0,
      bestRoas: 0,
      ...(overrides.profile ?? {}),
    },
    journey: {
      onboardingState: 'active',
      onboardingProgress: 100,
      journeyPhase: 'exploring',
      daysSinceFirstActivity: 3,
      featureAdoption: [],
      milestones: [],
      nextActions: ['Create your first marketing campaign'],
      ...(overrides.journey ?? {}),
    },
    behavior: {
      engagementLevel: 'moderate',
      skillLevel: 'intermediate',
      recentSessions: 3,
      recentMessages: 12,
      avgMessagesPerSession: 4,
      topTools: [],
      topActions: [],
      focusAreas: [],
      painPoints: [],
      preferredTime: 'morning',
      avgLatencyMs: 300,
      ...(overrides.behavior ?? {}),
    },
    guidance: {
      tips: [],
      featureDiscovery: [],
      performanceAlerts: [],
      healthWarnings: [],
      communicationStyle: 'Be direct.',
      ...(overrides.guidance ?? {}),
    },
  };
}

describe('buildDashboardIntelligenceSummary', () => {
  it('routes incomplete onboarding into a resume mission', () => {
    const summary = buildDashboardIntelligenceSummary(createIntel({
      journey: {
        onboardingProgress: 40,
        onboardingState: 'auditing',
        nextActions: ['Complete the onboarding wizard to unlock all platform features'],
      },
    }) as any);

    expect(summary.mission.actionPath).toBe('/dashboard/onboarding');
    expect(summary.mission.actionLabel).toBe('Resume onboarding');
    expect(summary.surfaceGuidance.overview).toContain('Complete the onboarding wizard');
  });

  it('surfaces campaign and AEO opportunities from profile and behavior', () => {
    const summary = buildDashboardIntelligenceSummary(createIntel({
      profile: {
        totalCampaigns: 1,
        activeCampaigns: 1,
        totalCreatives: 0,
        connectedIntegrations: ['google_ads'],
      },
      journey: {
        nextActions: ['Review campaign performance and let NexusAI suggest optimizations'],
      },
      behavior: {
        topTools: [{ tool: 'getAnalytics', count: 5 }],
      },
    }) as any);

    expect(summary.opportunities.some((item) => item.actionPath === '/dashboard/creatives')).toBe(true);
    expect(summary.opportunities.some((item) => item.actionPath === '/dashboard/aeo')).toBe(true);
    expect(summary.surfaceGuidance.creatives).toContain('Generate the first creative pack');
  });

  it('promotes health and performance warnings into risks', () => {
    const summary = buildDashboardIntelligenceSummary(createIntel({
      profile: {
        totalCampaigns: 2,
        activeCampaigns: 2,
        recentSpend: 1500,
        recentRevenue: 0,
      },
      guidance: {
        healthWarnings: ['google_ads integration health is 45%. Offer to reconnect or troubleshoot.'],
        performanceAlerts: ['Campaign "Brand Search" has ROAS 0.72 (below 1.0). Suggest reviewing targeting or pausing.'],
      },
    }) as any);

    expect(summary.risks[0]?.severity).toBe('critical');
    expect(summary.risks.some((item) => item.actionPath === '/dashboard/integrations')).toBe(true);
    expect(summary.risks.some((item) => item.actionPath === '/dashboard/analytics')).toBe(true);
  });
});