'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Lightbulb, TrendingUp, Users, Palette, Shuffle, Calendar, AlertTriangle, ChevronRight } from 'lucide-react';
import { useLang } from '@/app/providers';

const TYPE_CONFIG: Record<string, { icon: typeof Lightbulb; color: string; bg: string }> = {
  performance_pattern: { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
  audience_behavior: { icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  creative_trend: { icon: Palette, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  channel_correlation: { icon: Shuffle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  seasonal_pattern: { icon: Calendar, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  anomaly_detection: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

export function CompoundInsightsPanel() {
  const { t } = useLang();
  const { data: insights = [], isLoading } = useQuery({
    queryKey: ['compound-insights'],
    queryFn: () => api.getCompoundInsights(),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-6 animate-pulse">
        <div className="h-40" />
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/30 p-8 text-center">
        <Lightbulb size={28} className="mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">{t.compoundInsights.noInsights}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{t.compoundInsights.noInsightsDesc}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb size={14} className="text-amber-400" />
          <h3 className="text-sm font-semibold">{t.compoundInsights.heading}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{insights.length} {t.compoundInsights.active}</span>
      </div>
      <div className="divide-y divide-border/20">
        {insights.slice(0, 8).map((insight: any) => {
          const cfg = TYPE_CONFIG[insight.insightType] ?? TYPE_CONFIG.performance_pattern;
          const Icon = cfg.icon;
          const recommendations = Array.isArray(insight.recommendations) ? insight.recommendations : [];
          return (
            <div key={insight.id} className="px-5 py-4 space-y-2 hover:bg-secondary/10 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon size={14} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{insight.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{insight.description}</p>
                </div>
              </div>
              <div className="ml-11 space-y-1.5">
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{t.compoundInsights.confidence}</span>
                  <div className="flex-1 max-w-[120px]">
                    <ConfidenceBar value={insight.confidence ?? 0} />
                  </div>
                  <span>{(insight.sampleSize ?? 0).toLocaleString()} samples</span>
                </div>
                {recommendations.length > 0 && (
                  <div className="space-y-1">
                    {recommendations.slice(0, 2).map((rec: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <ChevronRight size={10} className="shrink-0 mt-0.5 text-primary" />
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
