'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TrendingUp, TrendingDown, Minus, X, Sparkles, Trophy, AlertTriangle, CheckCircle, BarChart3 } from 'lucide-react';

interface ReportMetric {
  label: string;
  current: number;
  previous: number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}

function formatCurrencyShort(v: number) {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function TrendArrow({ current, previous, higherIsBetter }: { current: number; previous: number; higherIsBetter: boolean }) {
  if (previous === 0) return <Minus size={12} className="text-muted-foreground" />;
  const pct = ((current - previous) / previous) * 100;
  const isPositive = higherIsBetter ? pct > 0 : pct < 0;
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-green-400' : pct === 0 ? 'text-muted-foreground' : 'text-red-400'}`}>
      <Icon size={12} />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function WeeklyReportCard() {
  const [isVisible, setIsVisible] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalyticsSummary(),
    staleTime: 60000,
    enabled: isVisible,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    staleTime: 60000,
    enabled: isVisible,
  });

  const { data: stats } = useQuery({
    queryKey: ['agents', 'stats'],
    queryFn: () => api.getAgentStats(),
    staleTime: 60000,
    enabled: isVisible,
  });

  const totalCompleted = agents?.reduce((s: number, a: any) => s + (a.tasksCompleted ?? 0), 0) ?? 0;
  const totalFailed = agents?.reduce((s: number, a: any) => s + (a.tasksFailed ?? 0), 0) ?? 0;
  const successRate = totalCompleted + totalFailed > 0 ? totalCompleted / (totalCompleted + totalFailed) : 0;

  const metrics: ReportMetric[] = useMemo(() => [
    {
      label: 'Revenue',
      current: toNumber(summary?.totalRevenue),
      previous: toNumber(summary?.previousRevenue ?? summary?.totalRevenue),
      format: formatCurrencyShort,
      higherIsBetter: true,
    },
    {
      label: 'ROAS',
      current: toNumber(summary?.roas),
      previous: toNumber(summary?.previousRoas ?? summary?.roas),
      format: (v: number) => `${v.toFixed(2)}x`,
      higherIsBetter: true,
    },
    {
      label: 'Agent Tasks',
      current: totalCompleted,
      previous: toNumber(stats?.previousCompleted ?? totalCompleted),
      format: (v: number) => String(v),
      higherIsBetter: true,
    },
    {
      label: 'Success Rate',
      current: successRate * 100,
      previous: toNumber(stats?.previousSuccessRate ?? successRate) * 100,
      format: (v: number) => `${v.toFixed(1)}%`,
      higherIsBetter: true,
    },
  ], [summary, totalCompleted, successRate, stats]);

  // Determine overall health
  const healthScore = useMemo(() => {
    let score = 0;
    if (successRate >= 0.9) score += 2;
    else if (successRate >= 0.7) score += 1;
    if (toNumber(summary?.roas) >= 2) score += 2;
    else if (toNumber(summary?.roas) >= 1) score += 1;
    if (totalCompleted > 10) score += 1;
    return score;
  }, [successRate, summary, totalCompleted]);

  const healthLabel = healthScore >= 4 ? 'Excellent' : healthScore >= 2 ? 'Good' : 'Needs Attention';
  const healthColor = healthScore >= 4 ? 'text-green-400' : healthScore >= 2 ? 'text-yellow-400' : 'text-red-400';
  const HealthIcon = healthScore >= 4 ? Trophy : healthScore >= 2 ? CheckCircle : AlertTriangle;

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-border/40 bg-card/60 hover:bg-card/80 px-4 py-2.5 text-xs font-medium text-foreground transition-all hover:border-primary/30"
      >
        <BarChart3 size={14} className="text-primary" />
        Weekly Report Card
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-xl shadow-xl shadow-black/10 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-primary" />
          <h3 className="text-sm font-semibold">Weekly AI Report Card</h3>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-muted-foreground"
        >
          <X size={14} />
        </button>
      </div>

      {/* Health banner */}
      <div className="px-5 py-3 flex items-center gap-3 border-b border-border/20">
        <HealthIcon size={18} className={healthColor} />
        <div>
          <p className={`text-sm font-bold ${healthColor}`}>{healthLabel}</p>
          <p className="text-[10px] text-muted-foreground">Overall platform performance</p>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border/20">
        {metrics.map((m) => (
          <div key={m.label} className="px-5 py-4 space-y-1">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{m.label}</p>
            <p className="text-lg font-bold">{m.format(m.current)}</p>
            <TrendArrow current={m.current} previous={m.previous} higherIsBetter={m.higherIsBetter} />
          </div>
        ))}
      </div>

      {/* Footer insights */}
      <div className="px-5 py-3 border-t border-border/30 bg-secondary/10">
        <p className="text-[10px] text-muted-foreground">
          {totalCompleted > 0
            ? `Your agents completed ${totalCompleted} tasks with a ${(successRate * 100).toFixed(0)}% success rate this period.`
            : 'Deploy agents to start tracking performance metrics.'}
        </p>
      </div>
    </div>
  );
}
