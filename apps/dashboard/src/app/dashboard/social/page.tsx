'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button, MetricCard } from '@/components/ui';
import { TierGateOverlay } from '@/components/tier-gate-overlay';
import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';

const PLATFORM_LABELS: Record<string, string> = {
  twitter: 'Twitter/X',
  hackernews: 'Hacker News',
  youtube: 'YouTube',
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-green-500',
  negative: 'text-red-500',
  neutral: 'text-yellow-500',
};

type Platform = 'twitter' | 'hackernews' | 'youtube';

export default function SocialPage() {
  const queryClient = useQueryClient();
  const [activePlatform, setActivePlatform] = useState<Platform>('twitter');
  const [showAddConfig, setShowAddConfig] = useState(false);
  const [configPlatform, setConfigPlatform] = useState('twitter');
  const [configKeywords, setConfigKeywords] = useState('');

  const { data: mentions = [], isLoading: mentionsLoading } = useQuery({
    queryKey: ['social', 'mentions', activePlatform],
    queryFn: () => api.getSocialMentions({ platform: activePlatform }),
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['social', 'config'],
    queryFn: () => api.getSocialConfig(),
  });

  const scanMutation = useMutation({
    mutationFn: () => api.triggerSocialScan([activePlatform]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'mentions'] }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveSocialMention(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'mentions'] }),
  });

  const addConfigMutation = useMutation({
    mutationFn: (data: { platform: string; keywords: string[] }) => api.addSocialConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'config'] });
      setShowAddConfig(false);
      setConfigKeywords('');
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id: string) => api.deleteSocialConfig(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'config'] }),
  });

  const totalMentions = mentions.length;
  const positiveMentions = mentions.filter((m: any) => m.sentiment === 'positive').length;
  const twitterCount = mentions.filter((m: any) => m.platform === 'twitter').length;
  const hnCount = mentions.filter((m: any) => m.platform === 'hackernews').length;

  const trendAnalysis = useMemo(() => {
    const sentimentByPlatform: Record<string, { positive: number; negative: number; neutral: number; total: number }> = {};
    mentions.forEach((m: any) => {
      const p = m.platform || 'unknown';
      if (!sentimentByPlatform[p]) sentimentByPlatform[p] = { positive: 0, negative: 0, neutral: 0, total: 0 };
      sentimentByPlatform[p].total++;
      if (m.sentiment === 'positive') sentimentByPlatform[p].positive++;
      else if (m.sentiment === 'negative') sentimentByPlatform[p].negative++;
      else sentimentByPlatform[p].neutral++;
    });

    const keywordFrequency: Record<string, number> = {};
    mentions.forEach((m: any) => {
      const words = (m.content ?? '').toLowerCase().split(/\s+/);
      words.forEach((w: string) => {
        if (w.length > 4) keywordFrequency[w] = (keywordFrequency[w] ?? 0) + 1;
      });
    });
    const trendingKeywords = Object.entries(keywordFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([word, count]) => ({ word, count }));

    return { sentimentByPlatform, trendingKeywords };
  }, [mentions]);

  const platformComparison = useMemo(() => {
    const platforms = ['twitter', 'hackernews', 'youtube'] as const;
    return platforms.map(p => {
      const pMentions = mentions.filter((m: any) => m.platform === p);
      const avgEngagement = pMentions.length
        ? (pMentions.reduce((s: number, m: any) => s + (m.engagementScore ?? 0), 0) / pMentions.length).toFixed(1)
        : '0';
      const positive = pMentions.filter((m: any) => m.sentiment === 'positive').length;
      return { platform: p, label: PLATFORM_LABELS[p], count: pMentions.length, avgEngagement, positive };
    });
  }, [mentions]);

  return (
    <TierGateOverlay requiredTier="growth" feature="Social Listening">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Social Listening</h1>
            <p className="text-muted-foreground text-sm mt-1">Monitor brand mentions across Twitter, Hacker News, and YouTube</p>
          </div>
          <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} size="sm">
            {scanMutation.isPending ? 'Scanning...' : `Scan ${PLATFORM_LABELS[activePlatform]}`}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard title="Total Mentions" value={String(totalMentions)} />
          <MetricCard title="Positive" value={String(positiveMentions)} />
          <MetricCard title="Twitter/X" value={String(twitterCount)} />
          <MetricCard title="Hacker News" value={String(hnCount)} />
        </div>

        {/* Trend Analysis & Platform Comparison */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3">Trending Keywords</h2>
            {trendAnalysis.trendingKeywords.length === 0 ? (
              <p className="text-xs text-muted-foreground">No mentions yet to analyze trends.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {trendAnalysis.trendingKeywords.map(({ word, count }) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                  >
                    {word}
                    <span className="text-[10px] text-muted-foreground">({count})</span>
                  </span>
                ))}
              </div>
            )}
            {Object.keys(trendAnalysis.sentimentByPlatform).length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">Sentiment by Platform</h3>
                {Object.entries(trendAnalysis.sentimentByPlatform).map(([platform, data]) => {
                  const posPct = data.total > 0 ? (data.positive / data.total * 100).toFixed(0) : '0';
                  return (
                    <div key={platform} className="flex items-center gap-2">
                      <span className="text-xs w-20 capitalize">{PLATFORM_LABELS[platform] ?? platform}</span>
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden flex">
                        <div className="h-full bg-green-500" style={{ width: `${data.positive / (data.total || 1) * 100}%` }} />
                        <div className="h-full bg-yellow-500" style={{ width: `${data.neutral / (data.total || 1) * 100}%` }} />
                        <div className="h-full bg-red-500" style={{ width: `${data.negative / (data.total || 1) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{posPct}%+</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={14} className="text-muted-foreground" />
              <h2 className="font-semibold text-sm">Platform Comparison</h2>
            </div>
            <div className="space-y-3">
              {platformComparison.map(p => (
                <div key={p.platform} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                  <div className="w-24">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.count} mentions</p>
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2 text-center">
                    <div>
                      <p className="text-sm font-bold">{p.avgEngagement}</p>
                      <p className="text-[10px] text-muted-foreground">Avg Engagement</p>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      {p.positive > p.count / 2 ? (
                        <TrendingUp size={12} className="text-green-500" />
                      ) : p.positive < p.count / 3 ? (
                        <TrendingDown size={12} className="text-red-500" />
                      ) : (
                        <Minus size={12} className="text-yellow-500" />
                      )}
                      <p className="text-sm font-bold">{p.count ? ((p.positive / p.count) * 100).toFixed(0) : 0}%</p>
                      <p className="text-[10px] text-muted-foreground">Positive</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Config Panel */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Keyword Configs</h2>
              <Button size="sm" variant="outline" onClick={() => setShowAddConfig(v => !v)}>
                {showAddConfig ? 'Cancel' : '+ Add'}
              </Button>
            </div>

            {showAddConfig && (
              <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                <select
                  className="w-full rounded border px-2 py-1 text-sm bg-background"
                  value={configPlatform}
                  onChange={e => setConfigPlatform(e.target.value)}
                >
                  <option value="twitter">Twitter/X</option>
                  <option value="hackernews">Hacker News</option>
                  <option value="youtube">YouTube</option>
                </select>
                <input
                  className="w-full rounded border px-2 py-1 text-sm bg-background"
                  placeholder="keywords (comma-separated)"
                  value={configKeywords}
                  onChange={e => setConfigKeywords(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!configKeywords || addConfigMutation.isPending}
                  onClick={() => addConfigMutation.mutate({
                    platform: configPlatform,
                    keywords: configKeywords.split(',').map(k => k.trim()).filter(Boolean),
                  })}
                >
                  Add Config
                </Button>
              </div>
            )}

            {configs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No configs yet.</p>
            ) : (
              <ul className="space-y-2">
                {configs.map((c: any) => (
                  <li key={c.id} className="flex items-start justify-between text-xs gap-1">
                    <div>
                      <Badge variant="outline" className="text-xs mb-1">{PLATFORM_LABELS[c.platform] ?? c.platform}</Badge>
                      <p className="text-muted-foreground">{Array.isArray(c.keywords) ? c.keywords.join(', ') : ''}</p>
                    </div>
                    <button
                      onClick={() => deleteConfigMutation.mutate(c.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Mentions Feed */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center gap-2">
              {(['twitter', 'hackernews', 'youtube'] as Platform[]).map(p => (
                <button
                  key={p}
                  onClick={() => setActivePlatform(p)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                    activePlatform === p
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>

            {mentionsLoading ? (
              <Card className="p-8 text-center text-muted-foreground text-sm">Loading mentions...</Card>
            ) : mentions.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground text-sm">
                No mentions found for {PLATFORM_LABELS[activePlatform]}. Configure keywords and run a scan.
              </Card>
            ) : (
              <div className="space-y-3">
                {mentions.map((mention: any) => (
                  <Card key={mention.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className="text-xs">{PLATFORM_LABELS[mention.platform] ?? mention.platform}</Badge>
                          {mention.sentiment && (
                            <span className={`text-xs font-medium ${SENTIMENT_COLORS[mention.sentiment] ?? ''}`}>
                              {mention.sentiment}
                            </span>
                          )}
                          {mention.engagementScore != null && (
                            <span className="text-xs text-muted-foreground">Engagement: {mention.engagementScore}</span>
                          )}
                        </div>
                        <p className="text-sm line-clamp-3">{mention.content}</p>
                        <div className="flex items-center gap-3 mt-2">
                          {mention.authorHandle && (
                            <span className="text-xs text-muted-foreground">@{mention.authorHandle}</span>
                          )}
                          {mention.url && (
                            <a href={mention.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                              View
                            </a>
                          )}
                        </div>
                      </div>
                      {mention.replyStatus === 'draft' && mention.platform === 'twitter' && (
                        <Button size="sm" onClick={() => approveMutation.mutate(mention.id)} disabled={approveMutation.isPending}>
                          Approve Reply
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </TierGateOverlay>
  );
}
