'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui';
import { AreaChartWidget, BarChartWidget, DonutChartWidget } from '@/components/charts';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Bot, TrendingUp, DollarSign, Zap, Users, ArrowUpRight, Search, Megaphone, BarChart2, Cpu } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DashboardSkeleton } from '@/components/skeletons';
import { WeeklyReportCard } from '@/components/weekly-report-card';
import { MilestonesPanel } from '@/components/milestones';
import { DashboardSectionBoundary } from '@/components/dashboard-section-boundary';

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
  const { data: session } = useSession();
  const name = (session?.user?.name ?? '').split(' ')[0] || 'Commander';
  const timeOfDay = useTimeOfDay();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalyticsSummary(),
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns', 'recent'],
    queryFn: () => api.getCampaigns({ limit: '5', sort: 'updated_at' }),
  });

  const { data: analytics } = useQuery({
    queryKey: ['analytics', 'chart'],
    queryFn: () => api.getAnalytics({ period: '30d', granularity: 'daily' }),
  });

  const spendData = analytics?.map((d: any) => ({ date: d.date, spend: d.spend, revenue: d.revenue })) ?? [];
  const activeAgents = agents?.filter((a: any) => a.status === 'processing') ?? [];

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
      label: 'Total Spend',
      value: formatCurrency(summary?.totalSpend ?? 0),
      delta: summary?.spendChange ? `${summary.spendChange > 0 ? '+' : ''}${formatPercent(summary.spendChange)}` : '—',
      deltaType: summary?.spendChange > 0 ? 'neg' : 'pos',
      icon: DollarSign,
      iconColor: 'text-violet-400',
      bg: 'from-violet-500/10',
    },
    {
      label: 'Revenue',
      value: formatCurrency(summary?.totalRevenue ?? 0),
      delta: summary?.revenueChange ? `${summary.revenueChange > 0 ? '+' : ''}${formatPercent(summary.revenueChange)}` : '—',
      deltaType: summary?.revenueChange > 0 ? 'pos' : 'neg',
      icon: TrendingUp,
      iconColor: 'text-cyan-400',
      bg: 'from-cyan-500/10',
    },
    {
      label: 'Conversions',
      value: formatNumber(summary?.totalConversions ?? 0),
      delta: summary?.conversionChange ? `${summary.conversionChange > 0 ? '+' : ''}${formatPercent(summary.conversionChange)}` : '—',
      deltaType: summary?.conversionChange > 0 ? 'pos' : 'neg',
      icon: Users,
      iconColor: 'text-pink-400',
      bg: 'from-pink-500/10',
    },
    {
      label: 'Active Agents',
      value: String(activeAgents.length),
      delta: `${agents?.length ?? 0} in fleet`,
      deltaType: 'neutral' as const,
      icon: Zap,
      iconColor: 'text-amber-400',
      bg: 'from-amber-500/10',
    },
  ] as const;

  if (summaryLoading && !summary) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Greeting */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-1">Command Center</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {timeOfDay ? `Good ${timeOfDay}, ${name}` : `Welcome, ${name}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeAgents.length > 0
              ? `${activeAgents.length} agent${activeAgents.length > 1 ? 's' : ''} running autonomously • Last 30 days`
              : 'Agents standing by · Last 30 days'}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse-dot" />
          System operational
        </div>
      </div>

      {/* Weekly Report Card */}
      <DashboardSectionBoundary title="Weekly Report Card">
        <WeeklyReportCard />
      </DashboardSectionBoundary>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(({ label, value, delta, deltaType, icon: Icon, iconColor, bg }) => (
          <div key={label} className={`relative rounded-2xl border border-border bg-gradient-to-br ${bg} to-transparent bg-card/60 p-5 overflow-hidden group hover:border-primary/30 transition-all`}>
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
              {delta} {deltaType !== 'neutral' ? 'vs last period' : ''}
            </p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card/60 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold">Spend vs Revenue</h3>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" />Spend</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400" />Revenue</span>
            </div>
          </div>
          <BarChartWidget
            data={spendData}
            bars={[
              { dataKey: 'spend', color: '#8b5cf6' },
              { dataKey: 'revenue', color: '#22d3ee' },
            ]}
            xAxisKey="date"
          />
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-6">
          <h3 className="text-sm font-semibold mb-1">Agent Fleet</h3>
          <p className="text-xs text-muted-foreground mb-4">By type</p>
          <DonutChartWidget data={agentDistribution} />
          <div className="mt-4 space-y-2">
            {agentDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <span className="capitalize text-muted-foreground">{item.name.replace('_', ' ')} Agent</span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
            {agentDistribution.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No agents provisioned</p>
            )}
          </div>
        </div>
      </div>

      {/* Agent status + campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agent status */}
        <div className="rounded-2xl border border-border bg-card/60 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold">Agent Status</h3>
            <a href="/dashboard/agents" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowUpRight size={12} />
            </a>
          </div>
          <div className="space-y-2">
            {(agents ?? []).slice(0, 6).map((agent: any) => {
              const typeKey = agent.type?.split('_')[0] ?? 'data';
              return (
                <div key={agent.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-4 py-3 hover:border-border transition-colors">
                  <div className="flex items-center gap-3">
                    {(() => { const Icon = AGENT_ICONS[typeKey] ?? Bot; return <Icon size={16} className="text-primary/80 shrink-0" />; })()}
                    <div>
                      <p className="text-xs font-medium capitalize">{agent.type?.replace(/_/g, ' ')} Agent</p>
                      <p className="text-xs text-muted-foreground">{agent.tasksCompleted ?? 0} tasks</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AgentPulse status={agent.status} />
                    <Badge variant={STATUS_VARIANT[agent.status] ?? 'outline'}>{agent.status}</Badge>
                  </div>
                </div>
              );
            })}
            {(!agents || agents.length === 0) && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bot size={32} className="text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No agents provisioned</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Visit Agents to deploy your swarm</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent campaigns */}
        <div className="rounded-2xl border border-border bg-card/60 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold">Recent Campaigns</h3>
            <a href="/dashboard/campaigns" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowUpRight size={12} />
            </a>
          </div>
          <div className="space-y-2">
            {(campaigns ?? []).slice(0, 5).map((campaign: any) => (
              <div key={campaign.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-4 py-3 hover:border-border transition-colors">
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
                <p className="text-sm text-muted-foreground">No campaigns yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Create your first campaign to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Milestones */}
      <DashboardSectionBoundary title="Milestones">
        <MilestonesPanel />
      </DashboardSectionBoundary>
    </div>
  );
}


