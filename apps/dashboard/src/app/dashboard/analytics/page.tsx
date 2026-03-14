'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, MetricCard } from '@/components/ui';
import { AreaChartWidget, BarChartWidget, DonutChartWidget } from '@/components/charts';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

const PERIODS = ['7d', '30d', '90d'] as const;

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<string>('30d');

  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalyticsSummary(),
  });

  const { data: dataPoints } = useQuery({
    queryKey: ['analytics', 'data', period],
    queryFn: () => api.getAnalytics({ period, granularity: 'daily' }),
  });

  const { data: funnel } = useQuery({
    queryKey: ['analytics', 'funnel'],
    queryFn: () => api.getFunnel(),
  });

  const { data: forecasts } = useQuery({
    queryKey: ['analytics', 'forecasts'],
    queryFn: () => api.getForecasts(),
  });

  const revenueData = (dataPoints ?? []).map((d: any) => ({
    date: d.date,
    revenue: d.revenue ?? 0,
  }));

  const ctrData = (dataPoints ?? []).map((d: any) => ({
    date: d.date,
    ctr: ((d.ctr ?? 0) * 100),
  }));

  const funnelData = (funnel ?? []).map((f: any) => ({
    name: f.stage,
    value: f.count ?? 0,
  }));

  const forecastBars = (forecasts ?? []).map((f: any) => ({
    name: f.metric,
    current: f.current ?? 0,
    predicted: f.predicted ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Deep performance analytics across all campaigns and channels.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                period === p ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="ROAS" value={`${(summary?.roas ?? 0).toFixed(2)}x`} change={summary?.roasChange ? `${formatPercent(summary.roasChange)} vs prev` : undefined} changeType={summary?.roasChange > 0 ? 'positive' : 'negative'} />
        <MetricCard title="CPA" value={formatCurrency(summary?.cpa ?? 0)} change={summary?.cpaChange ? `${formatPercent(summary.cpaChange)} vs prev` : undefined} changeType={summary?.cpaChange < 0 ? 'positive' : 'negative'} />
        <MetricCard title="Avg CTR" value={`${((summary?.avgCtr ?? 0) * 100).toFixed(2)}%`} change={summary?.ctrChange ? `${formatPercent(summary.ctrChange)} vs prev` : undefined} changeType={summary?.ctrChange > 0 ? 'positive' : 'negative'} />
        <MetricCard title="Impressions" value={formatNumber(summary?.totalImpressions ?? 0)} change={summary?.impressionChange ? `${formatPercent(summary.impressionChange)} vs prev` : undefined} changeType={summary?.impressionChange > 0 ? 'positive' : 'negative'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Revenue Trend</h3>
          <AreaChartWidget data={revenueData} dataKey="revenue" color="#10b981" />
        </Card>
        <Card>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">CTR Trend (%)</h3>
          <AreaChartWidget data={ctrData} dataKey="ctr" color="#8b5cf6" />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Conversion Funnel</h3>
          {funnelData.length > 0 ? (
            <>
              <DonutChartWidget data={funnelData} />
              <div className="mt-4 space-y-2">
                {funnelData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{item.name}</span>
                    <span className="font-medium">{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No funnel data available</p>
          )}
        </Card>
        <Card>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Forecasts (Current vs Predicted)</h3>
          {forecastBars.length > 0 ? (
            <BarChartWidget
              data={forecastBars}
              bars={[
                { dataKey: 'current', color: '#8b5cf6' },
                { dataKey: 'predicted', color: '#06b6d4' },
              ]}
              xAxisKey="name"
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No forecast data available</p>
          )}
        </Card>
      </div>
    </div>
  );
}
