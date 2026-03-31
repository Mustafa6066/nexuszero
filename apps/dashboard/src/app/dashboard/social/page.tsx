'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button, MetricCard } from '@/components/ui';
import { TierGateOverlay } from '@/components/tier-gate-overlay';

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
