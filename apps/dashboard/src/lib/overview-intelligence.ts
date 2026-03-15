export interface OverviewMission {
  title: string;
  detail: string;
  actionLabel?: string;
  actionPath?: string;
}

export interface OverviewRecommendation {
  title: string;
  detail: string;
  severity?: 'critical' | 'warning' | 'info';
  actionLabel?: string;
  actionPath?: string;
}

export interface OverviewHighlight {
  label: string;
  value: string;
}

export interface DashboardOverviewIntelligence {
  mission?: OverviewMission;
  opportunities?: OverviewRecommendation[];
  risks?: OverviewRecommendation[];
  highlights?: OverviewHighlight[];
}

export function getOverviewPanelData(intelligence?: DashboardOverviewIntelligence | null, fallbackMission?: OverviewMission) {
  const defaultFallback: OverviewMission = fallbackMission ?? {
    title: 'Turn the latest signal into an operating decision.',
    detail: 'Use the dashboard intelligence layer to identify the next action worth taking.',
    actionLabel: 'Review dashboard',
    actionPath: '/dashboard',
  };

  const severityRank = { critical: 0, warning: 1, info: 2 } as const;

  return {
    mission: intelligence?.mission ?? defaultFallback,
    opportunities: (intelligence?.opportunities ?? []).slice(0, 3),
    risks: [...(intelligence?.risks ?? [])]
      .sort((left, right) => severityRank[left.severity ?? 'info'] - severityRank[right.severity ?? 'info'])
      .slice(0, 3),
    highlights: (intelligence?.highlights ?? []).slice(0, 4),
  };
}