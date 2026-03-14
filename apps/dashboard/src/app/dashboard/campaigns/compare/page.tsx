'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ArrowLeft, GitCompare, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Link from 'next/link';

function fmt(v: number | undefined, type: 'currency' | 'number' | 'percent' = 'number') {
  if (v == null) return '—';
  if (type === 'currency') return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === 'percent') return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString();
}

function DeltaIndicator({ a, b, inverse }: { a?: number; b?: number; inverse?: boolean }) {
  if (a == null || b == null || b === 0) return <Minus size={12} className="text-muted-foreground" />;
  const diff = ((a - b) / b) * 100;
  const isPositive = inverse ? diff < 0 : diff > 0;
  if (Math.abs(diff) < 0.5) return <Minus size={12} className="text-muted-foreground" />;
  return isPositive
    ? <TrendingUp size={12} className="text-green-400" />
    : <TrendingDown size={12} className="text-red-400" />;
}

const METRICS: { key: string; label: string; type: 'currency' | 'number' | 'percent'; inverse?: boolean }[] = [
  { key: 'budget', label: 'Budget', type: 'currency' },
  { key: 'spend', label: 'Spend', type: 'currency' },
  { key: 'revenue', label: 'Revenue', type: 'currency' },
  { key: 'impressions', label: 'Impressions', type: 'number' },
  { key: 'clicks', label: 'Clicks', type: 'number' },
  { key: 'conversions', label: 'Conversions', type: 'number' },
  { key: 'ctr', label: 'CTR', type: 'percent' },
  { key: 'cpc', label: 'CPC', type: 'currency', inverse: true },
  { key: 'roas', label: 'ROAS', type: 'number' },
];

export default function CampaignComparePage() {
  const [selectedIds, setSelectedIds] = useState<[string | null, string | null]>([null, null]);

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns', 'all'],
    queryFn: () => api.getCampaigns(),
  });

  const [campaignA, campaignB] = useMemo(() => {
    return [
      campaigns.find((c: any) => c.id === selectedIds[0]) ?? null,
      campaigns.find((c: any) => c.id === selectedIds[1]) ?? null,
    ];
  }, [campaigns, selectedIds]);

  function getMetric(campaign: any, key: string): number | undefined {
    if (!campaign) return undefined;
    // Try direct field, then nested stats/metrics
    return campaign[key] ?? campaign.stats?.[key] ?? campaign.metrics?.[key] ?? undefined;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/campaigns" className="rounded-lg p-1.5 hover:bg-secondary transition-colors">
          <ArrowLeft size={16} className="text-muted-foreground" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <GitCompare size={16} className="text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Compare Campaigns</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Select two campaigns to compare side by side</p>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((slot) => (
          <div key={slot} className="rounded-2xl border border-border bg-card/60 p-4">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Campaign {slot === 0 ? 'A' : 'B'}
            </label>
            <select
              value={selectedIds[slot] ?? ''}
              onChange={(e) => {
                const next = [...selectedIds] as [string | null, string | null];
                next[slot] = e.target.value || null;
                setSelectedIds(next);
              }}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select a campaign…</option>
              {campaigns.map((c: any) => (
                <option key={c.id} value={c.id} disabled={c.id === selectedIds[slot === 0 ? 1 : 0]}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
            {selectedIds[slot] && (() => {
              const campaign = slot === 0 ? campaignA : campaignB;
              return campaign ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  {campaign.platform ?? 'Unknown'} · {campaign.status}
                </div>
              ) : null;
            })()}
          </div>
        ))}
      </div>

      {/* Comparison table */}
      {campaignA && campaignB && (
        <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-border">
            <div className="px-4 py-3 text-xs font-semibold text-muted-foreground">Metric</div>
            <div className="px-4 py-3 text-xs font-semibold text-center border-l border-border truncate">{campaignA.name}</div>
            <div className="px-4 py-3 text-xs font-semibold text-center border-l border-border truncate">{campaignB.name}</div>
          </div>
          {METRICS.map((m) => {
            const valA = getMetric(campaignA, m.key);
            const valB = getMetric(campaignB, m.key);
            return (
              <div key={m.key} className="grid grid-cols-[1fr_1fr_1fr] border-b border-border/40 last:border-0 hover:bg-secondary/20 transition-colors">
                <div className="px-4 py-3 text-xs text-muted-foreground">{m.label}</div>
                <div className="px-4 py-3 text-xs text-center border-l border-border/30 font-medium flex items-center justify-center gap-1.5">
                  {fmt(valA, m.type)}
                  <DeltaIndicator a={valA} b={valB} inverse={m.inverse} />
                </div>
                <div className="px-4 py-3 text-xs text-center border-l border-border/30 font-medium flex items-center justify-center gap-1.5">
                  {fmt(valB, m.type)}
                  <DeltaIndicator a={valB} b={valA} inverse={m.inverse} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(!campaignA || !campaignB) && (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-12 text-center">
          <GitCompare size={32} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Select two campaigns above to see a side-by-side comparison</p>
        </div>
      )}
    </div>
  );
}
