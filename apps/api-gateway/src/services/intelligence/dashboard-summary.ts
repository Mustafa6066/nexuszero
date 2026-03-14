import type { CustomerIntelligence } from './index.js';

export type DashboardSurface =
  | 'overview'
  | 'campaigns'
  | 'agents'
  | 'analytics'
  | 'creatives'
  | 'aeo'
  | 'integrations'
  | 'webhooks';

export interface DashboardRecommendation {
  title: string;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
  actionLabel?: string;
  actionPath?: string;
}

export interface DashboardMission {
  title: string;
  detail: string;
  actionLabel: string;
  actionPath: string;
}

export interface DashboardHighlight {
  label: string;
  value: string;
}

export interface DashboardIntelligenceSummary {
  nextActions: string[];
  healthWarnings: string[];
  performanceAlerts: string[];
  featureDiscovery: string[];
  communicationStyle: string;
  surfaceGuidance: Record<DashboardSurface, string>;
  mission: DashboardMission;
  opportunities: DashboardRecommendation[];
  risks: DashboardRecommendation[];
  highlights: DashboardHighlight[];
}

function hasTool(intel: CustomerIntelligence, toolName: string): boolean {
  return intel.behavior.topTools.some((tool) => tool.tool === toolName);
}

function toSentenceTitle(message: string, fallback: string): string {
  const cleaned = message.trim();
  if (!cleaned) return fallback;
  const sentence = cleaned.split('.').find(Boolean)?.trim() ?? cleaned;
  return sentence.length > 90 ? `${sentence.slice(0, 87)}...` : sentence;
}

function buildMission(intel: CustomerIntelligence): DashboardMission {
  if (intel.journey.onboardingProgress < 100) {
    return {
      title: 'Finish setup and move into your first live mission.',
      detail: intel.journey.nextActions[0] ?? 'Resume onboarding to connect your stack and provision the command center.',
      actionLabel: 'Resume onboarding',
      actionPath: '/dashboard/onboarding',
    };
  }

  if (intel.guidance.healthWarnings.length > 0) {
    return {
      title: 'Stabilize the stack before the next automation cycle.',
      detail: intel.guidance.healthWarnings[0],
      actionLabel: 'Review integrations',
      actionPath: '/dashboard/integrations',
    };
  }

  if (intel.profile.totalCampaigns === 0) {
    return {
      title: 'Launch the first live campaign to unlock optimization loops.',
      detail: 'Campaign activity gives NexusZero enough signal to produce stronger recommendations across analytics, creatives, and agent workflows.',
      actionLabel: 'Create campaign',
      actionPath: '/dashboard/campaigns?create=true',
    };
  }

  if (intel.profile.activeCampaigns > 0 && intel.profile.totalCreatives === 0) {
    return {
      title: 'Generate the first creative pack for your active campaigns.',
      detail: 'Creative variants unlock higher-quality testing and stronger recommendations from the Ad Agent.',
      actionLabel: 'Open creatives',
      actionPath: '/dashboard/creatives',
    };
  }

  if (intel.guidance.performanceAlerts.length > 0) {
    return {
      title: 'Tighten performance before scaling spend.',
      detail: intel.guidance.performanceAlerts[0],
      actionLabel: 'Open analytics',
      actionPath: '/dashboard/analytics',
    };
  }

  return {
    title: 'Turn your latest insight into a concrete operating move.',
    detail: intel.journey.nextActions[0] ?? 'Review the current workspace and approve the next best action.',
    actionLabel: 'Open dashboard',
    actionPath: '/dashboard',
  };
}

function buildOpportunities(intel: CustomerIntelligence): DashboardRecommendation[] {
  const opportunities: DashboardRecommendation[] = [];

  if (intel.profile.connectedIntegrations.length < 2) {
    opportunities.push({
      title: 'Deepen the data layer with one more core integration.',
      detail: 'A second connected platform increases attribution confidence and gives the agents better cross-signal context.',
      severity: 'info',
      actionLabel: 'Open integrations',
      actionPath: '/dashboard/integrations',
    });
  }

  if (intel.profile.activeCampaigns > 0 && intel.profile.totalCreatives === 0) {
    opportunities.push({
      title: 'Create your first AI-generated creative pack.',
      detail: 'Active campaigns with no generated creatives leave testing and learning velocity on the table.',
      severity: 'info',
      actionLabel: 'Open creatives',
      actionPath: '/dashboard/creatives',
    });
  }

  if ((intel.profile.tier === 'growth' || intel.profile.tier === 'enterprise') && !hasTool(intel, 'triggerAeoScan') && !hasTool(intel, 'getAeoCitations')) {
    opportunities.push({
      title: 'Start the first AI visibility scan.',
      detail: 'AEO is available on your plan but still unused. This is a low-friction way to surface branded query gaps.',
      severity: 'info',
      actionLabel: 'Open AEO',
      actionPath: '/dashboard/aeo',
    });
  }

  if (intel.journey.journeyPhase === 'scaling') {
    opportunities.push({
      title: 'Wire key events into your external operating stack.',
      detail: 'At your current usage level, webhook delivery is the cleanest way to operationalize alerts and agent outputs outside the dashboard.',
      severity: 'info',
      actionLabel: 'Open webhooks',
      actionPath: '/dashboard/webhooks',
    });
  }

  for (const discovery of intel.guidance.featureDiscovery) {
    opportunities.push({
      title: toSentenceTitle(discovery, 'Feature discovery'),
      detail: discovery,
      severity: 'info',
    });
  }

  return opportunities.slice(0, 3);
}

function buildRisks(intel: CustomerIntelligence): DashboardRecommendation[] {
  const risks: DashboardRecommendation[] = [];

  for (const warning of intel.guidance.healthWarnings) {
    risks.push({
      title: toSentenceTitle(warning, 'Health warning'),
      detail: warning,
      severity: 'critical',
      actionLabel: 'Review integrations',
      actionPath: '/dashboard/integrations',
    });
  }

  for (const alert of intel.guidance.performanceAlerts) {
    risks.push({
      title: toSentenceTitle(alert, 'Performance alert'),
      detail: alert,
      severity: 'warning',
      actionLabel: 'Open analytics',
      actionPath: '/dashboard/analytics',
    });
  }

  if (intel.profile.recentSpend > 0 && intel.profile.recentRevenue === 0) {
    risks.push({
      title: 'Spend is active but revenue is not being attributed.',
      detail: 'The workspace is seeing paid activity without corresponding revenue. Review tracking and conversion quality before scaling budgets.',
      severity: 'critical',
      actionLabel: 'Review analytics',
      actionPath: '/dashboard/analytics',
    });
  }

  return risks.slice(0, 3);
}

function buildHighlights(intel: CustomerIntelligence): DashboardHighlight[] {
  return [
    { label: 'Journey phase', value: intel.journey.journeyPhase },
    { label: 'Marketing maturity', value: intel.profile.maturity },
    { label: 'Active campaigns', value: String(intel.profile.activeCampaigns) },
    { label: 'Connected integrations', value: String(intel.profile.connectedIntegrations.length) },
    { label: 'Engagement', value: intel.behavior.engagementLevel },
    { label: 'Skill level', value: intel.behavior.skillLevel },
  ].slice(0, 4);
}

function buildSurfaceGuidance(intel: CustomerIntelligence): Record<DashboardSurface, string> {
  const mission = buildMission(intel);

  return {
    overview: mission.detail,
    campaigns:
      intel.guidance.performanceAlerts[0] ??
      (intel.profile.totalCampaigns === 0
        ? 'Create the first campaign so the optimization loop can begin.'
        : 'Review campaign performance and approve the next optimization move.'),
    agents:
      intel.guidance.healthWarnings[0] ??
      (intel.profile.activeCampaigns > 0
        ? 'Inspect the active fleet and verify the current task mix is aligned to your goal.'
        : 'Stand up the right agent mix for the first mission before scaling automation.'),
    analytics:
      intel.guidance.performanceAlerts[0] ??
      'Use funnel and forecast analysis to identify the next operational lever.',
    creatives:
      intel.profile.totalCreatives === 0
        ? 'Generate the first creative pack so the active campaigns have testable variants.'
        : intel.guidance.featureDiscovery[0] ?? 'Review brand score and predicted CTR to replace weak assets.',
    aeo:
      (intel.profile.tier === 'growth' || intel.profile.tier === 'enterprise')
        ? (!hasTool(intel, 'triggerAeoScan') && !hasTool(intel, 'getAeoCitations')
            ? 'Run the first AI visibility scan and surface the strongest branded query gap.'
            : 'Use visibility tracking to prioritize entity and citation improvements.')
        : 'AEO becomes more valuable as your content and campaign footprint scales.',
    integrations:
      intel.guidance.healthWarnings[0] ?? intel.journey.nextActions[0] ?? 'Connect the next highest-value platform to improve automation quality.',
    webhooks:
      intel.journey.journeyPhase === 'scaling'
        ? 'Route critical events into your external ops stack so alerts and agent outputs leave the dashboard.'
        : 'Use webhooks when the team needs campaign, anomaly, or agent events outside NexusZero.',
  };
}

export function buildDashboardIntelligenceSummary(intel: CustomerIntelligence): DashboardIntelligenceSummary {
  return {
    nextActions: intel.journey.nextActions,
    healthWarnings: intel.guidance.healthWarnings,
    performanceAlerts: intel.guidance.performanceAlerts,
    featureDiscovery: intel.guidance.featureDiscovery,
    communicationStyle: intel.guidance.communicationStyle,
    surfaceGuidance: buildSurfaceGuidance(intel),
    mission: buildMission(intel),
    opportunities: buildOpportunities(intel),
    risks: buildRisks(intel),
    highlights: buildHighlights(intel),
  };
}