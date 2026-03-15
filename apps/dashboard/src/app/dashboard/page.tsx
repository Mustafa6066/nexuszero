'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Badge, Button } from '@/components/ui';
import { AreaChartWidget, BarChartWidget, DonutChartWidget } from '@/components/charts';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Bot, TrendingUp, DollarSign, Zap, Users, ArrowUpRight, Search, Megaphone, BarChart2, Cpu, AlertTriangle, Sparkles, ShieldCheck, Plug } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WeeklyReportCard } from '@/components/weekly-report-card';
import { MilestonesPanel } from '@/components/milestones';
import { DashboardSectionBoundary } from '@/components/dashboard-section-boundary';
import { OverviewIntelligencePanel } from '@/components/overview-intelligence-panel';
import { useAssistantActions } from '@/hooks/use-assistant';
import { StreakWidget } from '@/components/streak-widget';
import { useLang } from '@/app/providers';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
  active: 'success',
  idle: 'outline',
  processing: 'warning',
  error: 'destructive',
};

const AGENT_ICONS: Record<string, LucideIcon> = {
  seo: Search,
  ad: Megaphone,
  aeo: Bot,
  data: BarChart2,
  creative: Cpu,
};

function getOnboardingState(tenant: any): string {
  return tenant?.onboardingState ?? tenant?.onboarding_state ?? 'created';
}

function isOnboardingComplete(state: string): boolean {
  return ['active', 'completed', 'live'].includes(state);
}

function AgentPulse({ status }: { status: string }) {
  const color = status === 'active' ? 'bg-green-400' : status === 'processing' ? 'bg-yellow-400' : status === 'error' ? 'bg-red-400' : 'bg-muted-foreground';
  return (
    <span className="relative flex h-2 w-2">
      {(status === 'active' || status === 'processing') && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60`} />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

function useTimeOfDay() {
  const [tod, setTod] = useState('');
  useEffect(() => {
    const h = new Date().getHours();
    setTod(h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening');
  }, []);
  return tod;
}

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLang();
  const { data: session, status } = useSession();
  const { open, sendMessage } = useAssistantActions();
  const name = (session?.user?.name ?? '').split(' ')[0] || 'Commander';
  const timeOfDay = useTimeOfDay();

  const { data: tenant } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.getMe(),
    enabled: status === 'authenticated',
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations', 'overview'],
    queryFn: () => api.getIntegrations(),
    enabled: status === 'authenticated',
  });

  const { data: intelligence } = useQuery({
    queryKey: ['intelligence', 'summary', 'overview'],
    queryFn: () => api.getIntelligenceSummary(),
    enabled: status === 'authenticated',
  });

  const { data: summary, error: summaryError } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalyticsSummary(),
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    enabled: status === 'authenticated',
  });

  const { data: agents, error: agentsError } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    enabled: status === 'authenticated',
  });

  const { data: campaigns, error: campaignsError } = useQuery({
    queryKey: ['campaigns', 'recent'],
    queryFn: () => api.getCampaigns({ limit: '5', sort: 'updated_at' }),
    enabled: status === 'authenticated',
  });

  const { data: analytics, error: analyticsError } = useQuery({
    queryKey: ['analytics', 'chart'],
    queryFn: () => api.getAnalytics({ period: '30d', granularity: 'daily' }),
    enabled: status === 'authenticated',
  });

  const spendData = analytics?.map((d: any) => ({ date: d.date, spend: d.spend, revenue: d.revenue })) ?? [];
  const activeAgents = agents?.filter((a: any) => a.status === 'processing') ?? [];
  const onboardingState = getOnboardingState(tenant);
  const degradedIntegrations = (integrations ?? []).filter((integration: any) => ['error', 'degraded'].includes(integration.status));
  const disconnectedIntegrations = (integrations ?? []).filter((integration: any) => integration.status === 'disconnected');

  useEffect(() => {
    if (status !== 'authenticated' || !tenant) return;
    if (!isOnboardingComplete(onboardingState)) {
      router.replace('/dashboard/onboarding');
    }
  }, [onboardingState, router, status, tenant]);

  const agentDistribution = agents
    ? Object.entries(
        agents.reduce((acc: Record<string, number>, a: any) => {
          acc[a.type] = (acc[a.type] || 0) + 1;
          return acc;
        }, {})
      ).map(([name, value]) => ({ name, value: value as number }))
    : [];

  const metrics = [
    {
      label: t.dashboard.totalSpend,
      value: formatCurrency(summary?.totalSpend ?? 0),
      delta: summary?.spendChange ? `${summary.spendChange > 0 ? '+' : ''}${formatPercent(summary.spendChange)}` : '—',
      deltaType: summary?.spendChange > 0 ? 'neg' : 'pos',
      icon: DollarSign,
      iconColor: 'text-primary',
      bg: 'from-primary/10',
    },
    {
      label: t.dashboard.revenue,
      value: formatCurrency(summary?.totalRevenue ?? 0),
      delta: summary?.revenueChange ? `${summary.revenueChange > 0 ? '+' : ''}${formatPercent(summary.revenueChange)}` : '—',
      deltaType: summary?.revenueChange > 0 ? 'pos' : 'neg',
      icon: TrendingUp,
      iconColor: 'text-green-400',
      bg: 'from-green-500/10',
    },
    {
      label: t.dashboard.conversions,
      value: formatNumber(summary?.totalConversions ?? 0),
      delta: summary?.conversionChange ? `${summary.conversionChange > 0 ? '+' : ''}${formatPercent(summary.conversionChange)}` : '—',
      deltaType: summary?.conversionChange > 0 ? 'pos' : 'neg',
      icon: Users,
      iconColor: 'text-emerald-400',
      bg: 'from-emerald-500/10',
    },
    {
      label: t.dashboard.activeAgents,
      value: String(activeAgents.length),
      delta: `${agents?.length ?? 0} ${t.dashboard.inFleet}`,
      deltaType: 'neutral' as const,
      icon: Zap,
      iconColor: 'text-amber-400',
      bg: 'from-amber-500/10',
    },
  ] as const;

  const hasDataError = Boolean(summaryError || agentsError || campaignsError || analyticsError);

  const dailyBrief = [
    intelligence?.dashboard?.nextActions?.[0]
      ? t.dashboard.briefNextMove(intelligence.dashboard.nextActions[0])
      : summary?.revenueChange != null
      ? summary.revenueChange >= 0
        ? t.dashboard.briefRevenueUp(formatPercent(Math.abs(summary.revenueChange)))
        : t.dashboard.briefRevenueDown(formatPercent(Math.abs(summary.revenueChange)))
      : t.dashboard.briefRevenueTrend,
    activeAgents.length > 0
      ? t.dashboard.briefAgentsActive(activeAgents.length)
      : t.dashboard.briefNoAgents,
    intelligence?.dashboard?.healthWarnings?.[0]
      ? intelligence.dashboard.healthWarnings[0]
      : degradedIntegrations.length > 0
      ? t.dashboard.briefIntegrationsAttention(degradedIntegrations.length)
      : t.dashboard.briefIntegrationsStable,
  ];

  const attentionItems = [
    degradedIntegrations.length > 0
      ? {
          title: t.dashboard.reconnectDegraded,
          detail: t.dashboard.degradedPlatforms(degradedIntegrations.length),
          action: t.dashboard.reviewIntegrations,
          onClick: () => router.push('/dashboard/integrations'),
        }
      : null,
    (!campaigns || campaigns.length === 0)
      ? {
          title: t.dashboard.noLiveCampaigns,
          detail: t.dashboard.launchFirst,
          action: t.dashboard.openCampaigns,
          onClick: () => router.push('/dashboard/campaigns?create=true'),
        }
      : null,
    disconnectedIntegrations.length > 0
      ? {
          title: t.dashboard.missingConnections,
          detail: intelligence?.dashboard?.surfaceGuidance?.integrations ?? t.dashboard.disconnectedPlatforms(disconnectedIntegrations.length),
          action: t.dashboard.connectStack,
          onClick: () => router.push('/dashboard/integrations'),
        }
      : null,
  ].filter(Boolean) as Array<{ title: string; detail: string; action: string; onClick: () => void }>;

  const nextBestMove = (() => {
    if (degradedIntegrations.length > 0) {
      return {
        eyebrow: t.dashboard.attentionRequired,
        title: t.dashboard.restoreHealth,
        detail: intelligence?.dashboard?.healthWarnings?.[0] ?? t.dashboard.nbmDegradedDetail,
        cta: t.dashboard.reviewIntegrations,
        onClick: () => router.push('/dashboard/integrations'),
        icon: Plug,
      };
    }

    if (!agents || agents.length === 0) {
      return {
        eyebrow: t.dashboard.nextBestMove,
        title: t.dashboard.deployFleet,
        detail: intelligence?.dashboard?.surfaceGuidance?.agents ?? t.dashboard.nbmNoAgentsDetail,
        cta: t.dashboard.openAgents,
        onClick: () => router.push('/dashboard/agents'),
        icon: Zap,
      };
    }

    if (!campaigns || campaigns.length === 0) {
      return {
        eyebrow: t.dashboard.nextBestMove,
        title: t.dashboard.createCampaignSignal,
        detail: intelligence?.dashboard?.surfaceGuidance?.campaigns ?? t.dashboard.nbmNoCampaignsDetail,
        cta: t.dashboard.createCampaign,
        onClick: () => router.push('/dashboard/campaigns?create=true'),
        icon: Sparkles,
      };
    }

    return {
      eyebrow: t.dashboard.recommendedAction,
      title: t.dashboard.askSummarize,
      detail: intelligence?.dashboard?.surfaceGuidance?.overview ?? t.dashboard.nbmDefaultDetail,
      cta: t.dashboard.askNexusAI,
      onClick: () => {
        open();
        void sendMessage('Summarize the single highest-impact action I should take today based on my current campaigns, integrations, and agent activity.');
      },
      icon: ShieldCheck,
    };
  })();

  if (status === 'authenticated' && tenant && !isOnboardingComplete(onboardingState)) {
    return (
      <div className="rounded-[1.75rem] border border-primary/15 bg-card/70 p-6 text-sm text-muted-foreground">
        {t.dashboard.preparingOnboarding}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in sm:space-y-8">
      {/* Greeting */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-1">{t.dashboard.commandCenter}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {timeOfDay === 'morning' ? `${t.dashboard.goodMorning}, ${name}` : timeOfDay === 'afternoon' ? `${t.dashboard.goodAfternoon}, ${name}` : timeOfDay === 'evening' ? `${t.dashboard.goodEvening}, ${name}` : `${t.dashboard.welcome}, ${name}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeAgents.length > 0
              ? t.dashboard.agentsRunning(activeAgents.length)
              : t.dashboard.agentsStandby}
          </p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-2 text-[11px] text-muted-foreground sm:px-4 sm:text-xs">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse-dot" />
          {t.common.systemOperational}
        </div>
      </div>

      {hasDataError && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          {t.dashboard.dataUnavailable}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.75rem] border border-primary/15 bg-[linear-gradient(135deg,hsl(var(--card)/0.92),hsl(var(--background)/0.84))] p-5 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">{t.dashboard.dailyBrief}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {timeOfDay ? `${timeOfDay === 'morning' ? t.dashboard.goodMorning : timeOfDay === 'afternoon' ? t.dashboard.goodAfternoon : t.dashboard.goodEvening}. ${t.dashboard.hereIsWhatChanged}` : t.dashboard.hereIsWhatChangedSince}
          </h2>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            {dailyBrief.map((item) => (
              <div key={item} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => {
              open();
              void sendMessage('Summarize what changed in my workspace since my last visit and tell me what to do next.');
            }}>
              {t.dashboard.openBrief}
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/analytics')}>
              {t.dashboard.reviewAnalytics}
            </Button>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-border bg-card/70 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
              <nextBestMove.icon size={18} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">{nextBestMove.eyebrow}</p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">{nextBestMove.title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{nextBestMove.detail}</p>
            </div>
          </div>
          <Button className="mt-5 w-full" onClick={nextBestMove.onClick}>{nextBestMove.cta}</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{t.dashboard.watchlist}</h3>
              <p className="text-xs text-muted-foreground">{t.dashboard.watchlistSubtitle}</p>
            </div>
            <Badge variant={attentionItems.length > 0 ? 'warning' : 'success'}>
              {attentionItems.length > 0 ? `${attentionItems.length} ${t.dashboard.pending}` : t.dashboard.allClear}
            </Badge>
          </div>
          <div className="space-y-3">
            {attentionItems.length > 0 ? attentionItems.map((item) => (
              <div key={item.title} className="rounded-xl border border-border/60 bg-secondary/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <AlertTriangle size={14} className="text-yellow-400" />
                      {item.title}
                    </div>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.detail}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={item.onClick}>{item.action}</Button>
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-green-500/20 bg-green-500/8 p-4 text-sm text-muted-foreground">
                {t.dashboard.noBlockers}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{t.dashboard.readyToAct}</h3>
              <p className="text-xs text-muted-foreground">{t.dashboard.readyToActSubtitle}</p>
            </div>
            <Badge variant="outline">{t.dashboard.actionQueue}</Badge>
          </div>

          <div className="space-y-3">
            <ActionCard
              title={t.dashboard.reviewFleet}
              detail={t.dashboard.reviewFleetDetail}
              onClick={() => router.push('/dashboard/agents')}
            />
            <ActionCard
              title={t.dashboard.inspectCampaigns}
              detail={t.dashboard.inspectCampaignsDetail}
              onClick={() => router.push('/dashboard/campaigns')}
            />
            <ActionCard
              title={t.dashboard.askRecommended}
              detail={t.dashboard.askRecommendedDetail}
              onClick={() => {
                open();
                void sendMessage('Based on my live workspace data, give me the next best move with reasoning and expected impact.');
              }}
            />
          </div>
        </div>
      </div>

      <DashboardSectionBoundary title={t.dashboard.strategicPulse}>
        <OverviewIntelligencePanel intelligence={intelligence?.dashboard} />
      </DashboardSectionBoundary>

      {/* Weekly Report Card */}
      <DashboardSectionBoundary title={t.dashboard.weeklyReportCard}>
        <WeeklyReportCard />
      </DashboardSectionBoundary>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, delta, deltaType, icon: Icon, iconColor, bg }) => (
          <div key={label} className={`group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${bg} to-transparent bg-card/60 p-4 transition-all hover:border-primary/30 sm:p-5`}>
            <div className="flex items-start justify-between mb-4">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              <div className={`rounded-xl bg-card/80 p-2 ${iconColor}`}>
                <Icon size={14} />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className={`text-xs mt-1 font-medium ${
              deltaType === 'pos' ? 'text-green-400' :
              deltaType === 'neg' ? 'text-red-400' :
              'text-muted-foreground'
            }`}>
              {delta} {deltaType !== 'neutral' ? t.dashboard.vsLastPeriod : ''}
            </p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 lg:col-span-2">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">{t.dashboard.spend} vs {t.dashboard.revenue}</h3>
              <p className="text-xs text-muted-foreground">{t.dashboard.last30Days}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />{t.dashboard.spend}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" />{t.dashboard.revenue}</span>
            </div>
          </div>
          <BarChartWidget
            data={spendData}
            bars={[
              { dataKey: 'spend', color: '#16a34a' },
              { dataKey: 'revenue', color: '#86efac' },
            ]}
            xAxisKey="date"
          />
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
          <h3 className="text-sm font-semibold mb-1">{t.dashboard.agentFleet}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t.dashboard.byType}</p>
          <DonutChartWidget data={agentDistribution} />
          <div className="mt-4 space-y-2">
            {agentDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <span className="capitalize text-muted-foreground">{item.name.replace('_', ' ')} Agent</span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
            {agentDistribution.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">{t.dashboard.noAgentsProvisioned}</p>
            )}
          </div>
        </div>
      </div>

      {/* Agent status + campaigns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Agent status */}
        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t.dashboard.agentStatus}</h3>
            <a href="/dashboard/agents" className="flex items-center gap-1 text-xs text-primary hover:underline">
              {t.common.viewAll} <ArrowUpRight size={12} />
            </a>
          </div>
          <div className="space-y-2">
            {(agents ?? []).slice(0, 6).map((agent: any) => {
              const typeKey = agent.type?.split('_')[0] ?? 'data';
              return (
                <div key={agent.id} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/30 px-4 py-3 transition-colors hover:border-border sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {(() => { const Icon = AGENT_ICONS[typeKey] ?? Bot; return <Icon size={16} className="text-primary/80 shrink-0" />; })()}
                    <div>
                      <p className="text-xs font-medium capitalize">{agent.type?.replace(/_/g, ' ')} Agent</p>
                      <p className="text-xs text-muted-foreground">{agent.tasksCompleted ?? 0} {t.dashboard.tasks}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <AgentPulse status={agent.status} />
                    <Badge variant={STATUS_VARIANT[agent.status] ?? 'outline'}>{agent.status}</Badge>
                  </div>
                </div>
              );
            })}
            {(!agents || agents.length === 0) && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bot size={32} className="text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t.dashboard.noAgentsProvisioned}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{t.dashboard.visitAgentsPage}</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent campaigns */}
        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t.dashboard.recentCampaigns}</h3>
            <a href="/dashboard/campaigns" className="flex items-center gap-1 text-xs text-primary hover:underline">
              {t.common.viewAll} <ArrowUpRight size={12} />
            </a>
          </div>
          <div className="space-y-2">
            {(campaigns ?? []).slice(0, 5).map((campaign: any) => (
              <div key={campaign.id} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-secondary/30 px-4 py-3 transition-colors hover:border-border sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{campaign.platform} · {formatCurrency((campaign.budget as any)?.dailyBudget ?? 0)}/day</p>
                </div>
                <Badge variant={campaign.status === 'active' ? 'success' : campaign.status === 'paused' ? 'warning' : 'outline'}>
                  {campaign.status}
                </Badge>
              </div>
            ))}
            {(!campaigns || campaigns.length === 0) && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm text-muted-foreground">{t.dashboard.noCampaignsYet}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{t.dashboard.createFirstCampaign}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Milestones & Streak */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <DashboardSectionBoundary title={t.dashboard.milestones}>
          <MilestonesPanel />
        </DashboardSectionBoundary>
        <div className="lg:w-72">
          <StreakWidget />
        </div>
      </div>
    </div>
  );
}

function ActionCard({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-border/60 bg-secondary/25 px-4 py-4 text-left transition-colors hover:border-primary/25 hover:bg-secondary/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">{detail}</p>
        </div>
        <ArrowUpRight size={14} className="shrink-0 text-primary" />
      </div>
    </button>
  );
}


