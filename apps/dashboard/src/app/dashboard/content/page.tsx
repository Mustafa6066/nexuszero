'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button, MetricCard } from '@/components/ui';
import { TierGateOverlay } from '@/components/tier-gate-overlay';

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'default',
  review: 'secondary',
  approved: 'outline',
  published: 'outline',
  rejected: 'destructive',
};

const TYPE_LABELS: Record<string, string> = {
  blog_post: 'Blog Post',
  social_post: 'Social Post',
  email: 'Email',
  landing_page: 'Landing Page',
};

const TONES = ['professional', 'casual', 'technical', 'friendly'] as const;
const CONTENT_TYPES = ['blog_post', 'social_post', 'email'] as const;

export default function ContentPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('draft');
  const [selectedDraft, setSelectedDraft] = useState<any>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    type: 'blog_post',
    topic: '',
    tone: 'professional',
    keywords: '',
    wordCount: 800,
    useWebSearch: false,
  });

  const params: Record<string, string> = { status: statusFilter };
  if (typeFilter) params.type = typeFilter;

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ['content', 'drafts', typeFilter, statusFilter],
    queryFn: () => api.getContentDrafts(params),
  });

  const generateMutation = useMutation({
    mutationFn: (data: any) => api.generateContent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content'] });
      setShowGenerateModal(false);
      setGenerateForm({ type: 'blog_post', topic: '', tone: 'professional', keywords: '', wordCount: 800, useWebSearch: false });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveContentDraft(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content'] });
      setSelectedDraft(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.rejectContentDraft(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content'] });
      setSelectedDraft(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteContentDraft(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content'] }),
  });

  const totalDrafts = drafts.length;
  const approvedCount = drafts.filter((d: any) => d.status === 'approved').length;
  const publishedCount = drafts.filter((d: any) => d.status === 'published').length;
  const avgSeo = drafts.length
    ? (drafts.reduce((s: number, d: any) => s + (d.seoScore ?? 0), 0) / drafts.length).toFixed(0)
    : '0';

  return (
    <TierGateOverlay requiredTier="growth" feature="Content Writer">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Content Writer</h1>
            <p className="text-muted-foreground text-sm mt-1">AI-generated blog posts, social copy, and email campaigns</p>
          </div>
          <Button onClick={() => setShowGenerateModal(true)} size="sm">Generate Content</Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard title="Total Drafts" value={String(totalDrafts)} />
          <MetricCard title="Approved" value={String(approvedCount)} />
          <MetricCard title="Published" value={String(publishedCount)} />
          <MetricCard title="Avg SEO Score" value={`${avgSeo}/100`} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Type:</span>
          {['', ...CONTENT_TYPES].map(t => (
            <button
              key={t || 'all'}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {t ? TYPE_LABELS[t] : 'All'}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-2">Status:</span>
          {['draft', 'review', 'approved', 'published', 'rejected'].map(s => (
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

        {/* Draft Grid */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12 text-sm">Loading drafts...</div>
        ) : drafts.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground text-sm">No content drafts found. Generate your first piece of content.</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map((draft: any) => (
              <Card
                key={draft.id}
                className="p-4 space-y-3 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedDraft(draft)}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-xs">{TYPE_LABELS[draft.type] ?? draft.type}</Badge>
                  <Badge variant={STATUS_VARIANTS[draft.status] ?? 'outline'} className="text-xs">{draft.status}</Badge>
                </div>
                <h3 className="font-medium text-sm line-clamp-2">{draft.title || 'Untitled'}</h3>
                <p className="text-xs text-muted-foreground line-clamp-3">{draft.content?.slice(0, 200)}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {draft.seoScore != null && <span>SEO: {draft.seoScore}/100</span>}
                  {draft.llmModel && <span className="truncate ml-2">{draft.llmModel.split('/')[1] ?? draft.llmModel}</span>}
                </div>
                {draft.status === 'draft' && (
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <Button size="sm" className="flex-1" onClick={() => approveMutation.mutate(draft.id)} disabled={approveMutation.isPending}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate({ id: draft.id })} disabled={rejectMutation.isPending}>
                      Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate(draft.id)} disabled={deleteMutation.isPending}>
                      Delete
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Draft Detail Modal */}
        {selectedDraft && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setSelectedDraft(null)}
          >
            <Card
              className="w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{TYPE_LABELS[selectedDraft.type] ?? selectedDraft.type}</Badge>
                  <Badge variant={STATUS_VARIANTS[selectedDraft.status] ?? 'outline'}>{selectedDraft.status}</Badge>
                </div>
                <button onClick={() => setSelectedDraft(null)} className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
              </div>
              <h2 className="text-lg font-semibold">{selectedDraft.title || 'Untitled'}</h2>
              {selectedDraft.seoScore != null && (
                <div className="flex items-center gap-4 text-sm">
                  <span>SEO Score: <strong>{selectedDraft.seoScore}/100</strong></span>
                  {selectedDraft.readabilityScore != null && (
                    <span>Readability: <strong>{selectedDraft.readabilityScore}/100</strong></span>
                  )}
                </div>
              )}
              <div className="rounded-lg bg-muted/30 p-4 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto font-mono">
                {selectedDraft.content}
              </div>
              {selectedDraft.status === 'draft' && (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => approveMutation.mutate(selectedDraft.id)} disabled={approveMutation.isPending}>
                    Approve & Queue for Publishing
                  </Button>
                  <Button variant="outline" onClick={() => rejectMutation.mutate({ id: selectedDraft.id })} disabled={rejectMutation.isPending}>
                    Reject
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Generate Modal */}
        {showGenerateModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowGenerateModal(false)}
          >
            <Card
              className="w-full max-w-lg p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Generate Content</h2>
                <button onClick={() => setShowGenerateModal(false)} className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Content Type</label>
                  <select
                    className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background"
                    value={generateForm.type}
                    onChange={e => setGenerateForm(f => ({ ...f, type: e.target.value }))}
                  >
                    {CONTENT_TYPES.map(t => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Topic / Brief</label>
                  <textarea
                    className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background resize-none"
                    rows={3}
                    placeholder="Describe the topic or key message..."
                    value={generateForm.topic}
                    onChange={e => setGenerateForm(f => ({ ...f, topic: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Tone</label>
                    <select
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background"
                      value={generateForm.tone}
                      onChange={e => setGenerateForm(f => ({ ...f, tone: e.target.value }))}
                    >
                      {TONES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Word Count</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background"
                      value={generateForm.wordCount}
                      min={100}
                      max={5000}
                      onChange={e => setGenerateForm(f => ({ ...f, wordCount: parseInt(e.target.value, 10) || 800 }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Keywords (comma-separated)</label>
                  <input
                    className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background"
                    placeholder="keyword1, keyword2..."
                    value={generateForm.keywords}
                    onChange={e => setGenerateForm(f => ({ ...f, keywords: e.target.value }))}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generateForm.useWebSearch}
                    onChange={e => setGenerateForm(f => ({ ...f, useWebSearch: e.target.checked }))}
                    className="rounded"
                  />
                  <span>Use real-time web research</span>
                </label>
              </div>

              <Button
                className="w-full"
                disabled={!generateForm.topic || generateMutation.isPending}
                onClick={() => generateMutation.mutate({
                  type: generateForm.type,
                  brief: {
                    topic: generateForm.topic,
                    tone: generateForm.tone,
                    wordCount: generateForm.wordCount,
                    keywords: generateForm.keywords.split(',').map(k => k.trim()).filter(Boolean),
                  },
                  useWebSearch: generateForm.useWebSearch,
                })}
              >
                {generateMutation.isPending ? 'Queuing...' : 'Generate'}
              </Button>
              {generateMutation.isSuccess && (
                <p className="text-xs text-green-500 text-center">Content generation queued. Check back in a moment.</p>
              )}
            </Card>
          </div>
        )}
      </div>
    </TierGateOverlay>
  );
}
