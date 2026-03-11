'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, MetricCard, Badge } from '@/components/ui';
import { AreaChartWidget, BarChartWidget, DonutChartWidget } from '@/components/charts';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

function DollarIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
}

function TrendUpIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
}

function UsersIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}

function ZapIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
  active: 'success',
  idle: 'outline',
  processing: 'warning',
  error: 'destructive',
};

export default function DashboardPage() {
  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalyticsSummary(),
    refetchInterval: 30000,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    refetchInterval: 15000,
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

  const agentDistribution = agents
    ? Object.entries(
        agents.reduce((acc: Record<string, number>, a: any) => {
          acc[a.agent_type] = (acc[a.agent_type] || 0) + 1;
          return acc;
        }, {})
      ).map(([name, value]) => ({ name, value: value as number }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome back. Here&apos;s what&apos;s happening across your marketing stack.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Spend"
          value={formatCurrency(summary?.totalSpend ?? 0)}
          change={summary?.spendChange ? `${summary.spendChange > 0 ? '+' : ''}${formatPercent(summary.spendChange)} vs last period` : undefined}
          changeType={summary?.spendChange > 0 ? 'negative' : 'positive'}
          icon={<DollarIcon />}
        />
        <MetricCard
          title="Revenue"
          value={formatCurrency(summary?.totalRevenue ?? 0)}
          change={summary?.revenueChange ? `${summary.revenueChange > 0 ? '+' : ''}${formatPercent(summary.revenueChange)} vs last period` : undefined}
          changeType={summary?.revenueChange > 0 ? 'positive' : 'negative'}
          icon={<TrendUpIcon />}
        />
        <MetricCard
          title="Conversions"
          value={formatNumber(summary?.totalConversions ?? 0)}
          change={summary?.conversionChange ? `${summary.conversionChange > 0 ? '+' : ''}${formatPercent(summary.conversionChange)} vs last period` : undefined}
          changeType={summary?.conversionChange > 0 ? 'positive' : 'negative'}
          icon={<UsersIcon />}
        />
        <MetricCard
          title="Active Agents"
          value={String(agents?.filter((a: any) => a.status === 'active').length ?? 0)}
          change={`${agents?.length ?? 0} total agents`}
          changeType="neutral"
          icon={<ZapIcon />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Spend vs Revenue (30 days)</h3>
          <BarChartWidget
            data={spendData}
            bars={[
              { dataKey: 'spend', color: '#8b5cf6' },
              { dataKey: 'revenue', color: '#10b981' },
            ]}
            xAxisKey="date"
          />
        </Card>
        <Card>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Agent Distribution</h3>
          <DonutChartWidget data={agentDistribution} />
          <div className="mt-4 space-y-2">
            {agentDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="capitalize text-muted-foreground">{item.name.replace('_', ' ')}</span>
                <span className="font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Agent Status</h3>
          <div className="space-y-3">
            {(agents ?? []).slice(0, 8).map((agent: any) => (
              <div key={agent.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium capitalize">{agent.agent_type.replace('_', ' ')} Agent</p>
                  <p className="text-xs text-muted-foreground">Tasks completed: {agent.tasks_completed ?? 0}</p>
                </div>
                <Badge variant={STATUS_VARIANT[agent.status] ?? 'outline'}>{agent.status}</Badge>
              </div>
            ))}
            {(!agents || agents.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">No agents found</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Recent Campaigns</h3>
          <div className="space-y-3">
            {(campaigns ?? []).slice(0, 5).map((campaign: any) => (
              <div key={campaign.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground">{campaign.platform} &middot; {formatCurrency(campaign.daily_budget ?? 0)}/day</p>
                </div>
                <Badge variant={campaign.status === 'active' ? 'success' : campaign.status === 'paused' ? 'warning' : 'outline'}>
                  {campaign.status}
                </Badge>
              </div>
            ))}
            {(!campaigns || campaigns.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">No campaigns found</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
