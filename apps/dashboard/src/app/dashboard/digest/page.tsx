'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import { useLang } from '@/app/providers';
import { BarChart3, TrendingUp, Zap, Brain, Calendar, AlertTriangle } from 'lucide-react';

const CATEGORY_ICONS: Record<string, typeof Brain> = {
  optimization: Zap,
  creation: TrendingUp,
  analysis: BarChart3,
  alert: AlertTriangle,
};

export default function DigestPage() {
  const { t } = useLang();
  const [days, setDays] = useState(7);

  const { data: digest, isLoading } = useQuery({
    queryKey: ['weekly-digest', days],
    queryFn: () => api.getWeeklyDigest(days),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.digest?.heading || 'Weekly Digest'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.digest?.subtitle || 'Summary of agent activity and impact'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                days === d ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-4 w-1/2 rounded bg-secondary" />
              <div className="mt-2 h-8 w-1/3 rounded bg-secondary" />
            </Card>
          ))}
        </div>
      ) : !digest ? (
        <Card className="text-center py-12">
          <Brain size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-muted-foreground">{t.digest?.noData || 'No agent activity in this period'}</p>
        </Card>
      ) : (
        <>
          {/* Period header */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar size={12} />
            <span>{new Date(digest.period.from).toLocaleDateString()} — {new Date(digest.period.to).toLocaleDateString()}</span>
          </div>

          {/* Summary metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-sm text-muted-foreground">{t.digest?.totalActions || 'Total Actions'}</p>
              <p className="mt-1 text-2xl font-bold">{digest.totalActions}</p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">{t.digest?.avgImpact || 'Avg Impact'}</p>
              <p className={`mt-1 text-2xl font-bold ${digest.avgImpact > 0 ? 'text-green-400' : digest.avgImpact < 0 ? 'text-red-400' : ''}`}>
                {digest.avgImpact > 0 ? '+' : ''}{digest.avgImpact.toFixed(2)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">{t.digest?.categories || 'Categories'}</p>
              <p className="mt-1 text-2xl font-bold">{Object.keys(digest.byCategory).length}</p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">{t.digest?.agentsActive || 'Agents Active'}</p>
              <p className="mt-1 text-2xl font-bold">{Object.keys(digest.byAgent).length}</p>
            </Card>
          </div>

          {/* Category breakdown */}
          <Card>
            <h3 className="text-sm font-semibold mb-3">{t.digest?.byCategory || 'Actions by Category'}</h3>
            <div className="space-y-2">
              {Object.entries(digest.byCategory as Record<string, number>)
                .sort(([, a], [, b]) => b - a)
                .map(([category, count]) => {
                  const Icon = CATEGORY_ICONS[category] || Brain;
                  const pct = digest.totalActions > 0 ? (count / digest.totalActions) * 100 : 0;
                  return (
                    <div key={category} className="flex items-center gap-3">
                      <Icon size={14} className="text-muted-foreground shrink-0" />
                      <span className="text-sm capitalize w-24">{category}</span>
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-end">{count}</span>
                    </div>
                  );
                })}
            </div>
          </Card>

          {/* Highlights */}
          {digest.highlights?.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold mb-3">{t.digest?.highlights || 'Top Highlights'}</h3>
              <div className="space-y-3">
                {digest.highlights.map((h: any, i: number) => (
                  <div key={i} className="rounded-xl bg-secondary/30 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={h.category === 'alert' ? 'warning' : h.category === 'optimization' ? 'success' : 'outline'}>
                        {h.category}
                      </Badge>
                      <span className="text-xs font-medium">{h.actionType?.replace(/_/g, ' ')}</span>
                      {h.confidence != null && (
                        <span className="text-[10px] text-muted-foreground ms-auto">
                          {(h.confidence * 100).toFixed(0)}% confidence
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{h.reasoning}</p>
                    {h.impactDelta != null && h.impactMetric && (
                      <p className={`text-xs mt-1 font-medium ${h.impactDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {h.impactMetric}: {h.impactDelta > 0 ? '+' : ''}{h.impactDelta.toFixed(2)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
