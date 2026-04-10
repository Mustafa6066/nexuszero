'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button, MetricCard } from '@/components/ui';
import { TierGateOverlay } from '@/components/tier-gate-overlay';
import { MessageSquare, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-green-500',
  negative: 'text-red-500',
  neutral: 'text-yellow-500',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'default',
  approved: 'secondary',
  posted: 'outline',
  dismissed: 'destructive',
};

const DEFAULT_TEMPLATES = [
  { id: 'helpful', label: 'Helpful', text: 'Great question! Here\'s what we\'ve found works well: {context}. Happy to dive deeper if you need more details.' },
  { id: 'acknowledge', label: 'Acknowledge', text: 'Thanks for mentioning us! We appreciate the feedback. {context}' },
  { id: 'support', label: 'Support', text: 'Sorry to hear about that experience. Our team can help — would you mind sharing more details so we can look into it?' },
  { id: 'engage', label: 'Engage', text: 'Interesting perspective! We\'ve been thinking about this too. {context}' },
];

export default function RedditPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedMention, setSelectedMention] = useState<any>(null);
  const [newSubreddit, setNewSubreddit] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [showAddSubreddit, setShowAddSubreddit] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const { data: mentions = [], isLoading: mentionsLoading } = useQuery({
    queryKey: ['reddit', 'mentions', statusFilter],
    queryFn: () => api.getRedditMentions({ status: statusFilter }),
  });

  const { data: subreddits = [], isLoading: subredditsLoading } = useQuery({
    queryKey: ['reddit', 'subreddits'],
    queryFn: () => api.getSubreddits(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveRedditMention(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reddit', 'mentions'] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.dismissRedditMention(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reddit', 'mentions'] });
      setSelectedMention(null);
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => api.triggerRedditScan(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reddit'] }),
  });

  const addSubredditMutation = useMutation({
    mutationFn: (data: { subreddit: string; keywords: string[] }) => api.addSubreddit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reddit', 'subreddits'] });
      setNewSubreddit('');
      setNewKeywords('');
      setShowAddSubreddit(false);
    },
  });

  const deleteSubredditMutation = useMutation({
    mutationFn: (id: string) => api.deleteSubreddit(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reddit', 'subreddits'] }),
  });

  const totalMentions = mentions.length;
  const pending = mentions.filter((m: any) => m.replyStatus === 'pending').length;
  const posted = mentions.filter((m: any) => m.replyStatus === 'posted').length;
  const avgSentiment = mentions.length
    ? (mentions.filter((m: any) => m.sentiment === 'positive').length / mentions.length * 100).toFixed(0)
    : '0';

  const sentimentBreakdown = useMemo(() => {
    const pos = mentions.filter((m: any) => m.sentiment === 'positive').length;
    const neg = mentions.filter((m: any) => m.sentiment === 'negative').length;
    const neu = mentions.filter((m: any) => m.sentiment === 'neutral').length;
    const total = pos + neg + neu || 1;
    return { positive: pos, negative: neg, neutral: neu, total, posPct: (pos / total * 100).toFixed(0), negPct: (neg / total * 100).toFixed(0), neuPct: (neu / total * 100).toFixed(0) };
  }, [mentions]);

  const engagementStats = useMemo(() => {
    if (!mentions.length) return { avgScore: 0, topSubreddit: '-', highEngagement: 0 };
    const avgScore = (mentions.reduce((s: number, m: any) => s + (m.score ?? 0), 0) / mentions.length).toFixed(1);
    const subredditCounts: Record<string, number> = {};
    mentions.forEach((m: any) => { subredditCounts[m.subreddit] = (subredditCounts[m.subreddit] ?? 0) + 1; });
    const topSubreddit = Object.entries(subredditCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '-';
    const highEngagement = mentions.filter((m: any) => (m.score ?? 0) > 10).length;
    return { avgScore, topSubreddit, highEngagement };
  }, [mentions]);

  return (
    <TierGateOverlay requiredTier="growth" feature="Reddit Intelligence">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reddit Intelligence</h1>
            <p className="text-muted-foreground text-sm mt-1">Monitor subreddits and engage with brand mentions</p>
          </div>
          <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} size="sm">
            {scanMutation.isPending ? 'Scanning...' : 'Scan Now'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard title="Total Mentions" value={String(totalMentions)} />
          <MetricCard title="Pending Review" value={String(pending)} />
          <MetricCard title="Replies Posted" value={String(posted)} />
          <MetricCard title="Positive Sentiment" value={`${avgSentiment}%`} />
        </div>

        {/* Sentiment Distribution & Engagement */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3">Sentiment Distribution</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <TrendingUp size={14} className="text-green-500 shrink-0" />
                <span className="text-sm w-16">Positive</span>
                <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${sentimentBreakdown.posPct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">{sentimentBreakdown.positive} ({sentimentBreakdown.posPct}%)</span>
              </div>
              <div className="flex items-center gap-3">
                <Minus size={14} className="text-yellow-500 shrink-0" />
                <span className="text-sm w-16">Neutral</span>
                <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-yellow-500 transition-all" style={{ width: `${sentimentBreakdown.neuPct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">{sentimentBreakdown.neutral} ({sentimentBreakdown.neuPct}%)</span>
              </div>
              <div className="flex items-center gap-3">
                <TrendingDown size={14} className="text-red-500 shrink-0" />
                <span className="text-sm w-16">Negative</span>
                <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${sentimentBreakdown.negPct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">{sentimentBreakdown.negative} ({sentimentBreakdown.negPct}%)</span>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3">Engagement Metrics</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-2xl font-bold">{engagementStats.avgScore}</p>
                <p className="text-xs text-muted-foreground mt-1">Avg Score</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-2xl font-bold">{engagementStats.highEngagement}</p>
                <p className="text-xs text-muted-foreground mt-1">High Engagement</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-sm font-bold truncate">r/{engagementStats.topSubreddit}</p>
                <p className="text-xs text-muted-foreground mt-1">Top Subreddit</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Monitored Subreddits */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Monitored Subreddits</h2>
              <Button size="sm" variant="outline" onClick={() => setShowAddSubreddit(v => !v)}>
                {showAddSubreddit ? 'Cancel' : '+ Add'}
              </Button>
            </div>

            {showAddSubreddit && (
              <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                <input
                  className="w-full rounded border px-2 py-1 text-sm bg-background"
                  placeholder="r/subreddit"
                  value={newSubreddit}
                  onChange={e => setNewSubreddit(e.target.value)}
                />
                <input
                  className="w-full rounded border px-2 py-1 text-sm bg-background"
                  placeholder="keywords (comma-separated)"
                  value={newKeywords}
                  onChange={e => setNewKeywords(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!newSubreddit || addSubredditMutation.isPending}
                  onClick={() => addSubredditMutation.mutate({
                    subreddit: newSubreddit.replace(/^r\//, ''),
                    keywords: newKeywords.split(',').map(k => k.trim()).filter(Boolean),
                  })}
                >
                  Add Subreddit
                </Button>
              </div>
            )}

            {subredditsLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : subreddits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subreddits monitored yet.</p>
            ) : (
              <ul className="space-y-2">
                {subreddits.map((sub: any) => (
                  <li key={sub.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">r/{sub.subreddit}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {Array.isArray(sub.keywords) ? sub.keywords.slice(0, 2).join(', ') : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteSubredditMutation.mutate(sub.id)}
                      className="text-muted-foreground hover:text-destructive text-xs"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Response Templates */}
          <Card className="p-4 space-y-3">
            <h2 className="font-semibold text-sm">Response Templates</h2>
            <div className="space-y-2">
              {DEFAULT_TEMPLATES.map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => setActiveTemplate(activeTemplate === tmpl.id ? null : tmpl.id)}
                  className={`w-full text-left p-2 rounded-lg border text-xs transition-colors ${
                    activeTemplate === tmpl.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare size={12} className="text-muted-foreground" />
                    <span className="font-medium">{tmpl.label}</span>
                  </div>
                  {activeTemplate === tmpl.id && (
                    <p className="text-muted-foreground mt-1 leading-relaxed">{tmpl.text}</p>
                  )}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Click to preview. Templates used by AI when drafting replies.</p>
          </Card>

          {/* Mention Feed */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              {['pending', 'approved', 'posted', 'dismissed'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {mentionsLoading ? (
              <Card className="p-8 text-center text-muted-foreground text-sm">Loading mentions...</Card>
            ) : mentions.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground text-sm">
                No {statusFilter} mentions found. Run a scan to discover new mentions.
              </Card>
            ) : (
              <div className="space-y-3">
                {mentions.map((mention: any) => (
                  <Card
                    key={mention.id}
                    className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setSelectedMention(mention)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">r/{mention.subreddit}</Badge>
                          {mention.sentiment && (
                            <span className={`text-xs font-medium ${SENTIMENT_COLORS[mention.sentiment] ?? ''}`}>
                              {mention.sentiment}
                            </span>
                          )}
                          {mention.intent && (
                            <span className="text-xs text-muted-foreground">{mention.intent}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium mt-1 truncate">{mention.postTitle}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{mention.mentionText}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-muted-foreground">u/{mention.author}</span>
                          <span className="text-xs text-muted-foreground">Score: {mention.score}</span>
                        </div>
                      </div>
                      <Badge variant={STATUS_VARIANTS[mention.replyStatus] ?? 'outline'} className="shrink-0 text-xs">
                        {mention.replyStatus}
                      </Badge>
                    </div>

                    {mention.replyStatus === 'pending' && (
                      <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(mention.id)}
                        >
                          Approve & Post
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={dismissMutation.isPending}
                          onClick={() => dismissMutation.mutate(mention.id)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Draft Review Modal */}
        {selectedMention && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setSelectedMention(null)}
          >
            <Card
              className="w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Mention Detail</h2>
                <button onClick={() => setSelectedMention(null)} className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">r/{selectedMention.subreddit} · u/{selectedMention.author}</p>
                <p className="font-medium">{selectedMention.postTitle}</p>
                <a href={selectedMention.postUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                  View on Reddit
                </a>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 text-sm">{selectedMention.mentionText}</div>
              {selectedMention.draftReply && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">AI Draft Reply</p>
                  <div className="rounded-lg border p-3 text-sm">{selectedMention.draftReply}</div>
                </div>
              )}
              {selectedMention.replyStatus === 'pending' && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={approveMutation.isPending}
                    onClick={() => { approveMutation.mutate(selectedMention.id); setSelectedMention(null); }}
                  >
                    Approve & Post Reply
                  </Button>
                  <Button
                    variant="outline"
                    disabled={dismissMutation.isPending}
                    onClick={() => dismissMutation.mutate(selectedMention.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </TierGateOverlay>
  );
}
