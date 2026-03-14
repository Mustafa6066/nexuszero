'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';

const FORMAT_LABELS: Record<string, string> = {
  display_banner: 'Display Banner',
  social_image: 'Social Image',
  social_video: 'Social Video',
  search_responsive: 'Search Responsive',
  email_header: 'Email Header',
};

const GENERATION_PRESETS = {
  display_banner: {
    type: 'image',
    platform: 'google_display',
    dimensions: { width: 300, height: 250, label: 'Display Banner' },
  },
  social_image: {
    type: 'image',
    platform: 'instagram_feed',
    dimensions: { width: 1080, height: 1080, label: 'Social Image' },
  },
  social_video: {
    type: 'video_script',
    platform: 'instagram_reels',
    dimensions: { width: 1080, height: 1920, label: 'Social Video' },
  },
  search_responsive: {
    type: 'ad_copy',
    platform: 'google_search',
    dimensions: undefined,
  },
  email_header: {
    type: 'email_template',
    platform: 'email',
    dimensions: { width: 1200, height: 600, label: 'Email Header' },
  },
} as const;

export default function CreativesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('all');
  const [showGenerate, setShowGenerate] = useState(false);

  const { data: creatives, isLoading } = useQuery({
    queryKey: ['creatives', filter],
    queryFn: () => api.getCreatives(filter !== 'all' ? { format: filter } : undefined),
  });

  const formats = ['all', 'display_banner', 'social_image', 'social_video', 'search_responsive'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Creatives</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-generated ad creatives and performance data.</p>
        </div>
        <Button onClick={() => setShowGenerate(true)}>+ Generate Creative</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {formats.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {f === 'all' ? 'All' : FORMAT_LABELS[f] ?? f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-video w-full rounded-lg bg-secondary" />
              <div className="mt-3 h-4 w-2/3 rounded bg-secondary" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(creatives ?? []).map((creative: any) => (
            <Card key={creative.id} className="overflow-hidden p-0">
              <div className="aspect-video w-full bg-secondary flex items-center justify-center">
                {creative.image_url ? (
                  <img
                    src={creative.image_url}
                    alt={creative.headline ?? 'Creative'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-center p-4">
                    <p className="text-sm font-medium">{creative.headline ?? 'No preview'}</p>
                    {creative.body_text && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{creative.body_text}</p>}
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{creative.headline ?? 'Untitled Creative'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{FORMAT_LABELS[creative.format] ?? creative.format}</p>
                  </div>
                  <Badge variant={
                    creative.status === 'active' ? 'success' :
                    creative.status === 'testing' ? 'warning' :
                    creative.status === 'winner' ? 'success' :
                    creative.status === 'fatigued' ? 'destructive' :
                    'outline'
                  }>
                    {creative.status ?? 'draft'}
                  </Badge>
                </div>

                {creative.performance_score != null && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Score</p>
                      <p className="text-sm font-medium">{(creative.performance_score * 100).toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CTR</p>
                      <p className="text-sm font-medium">{((creative.ctr ?? 0) * 100).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Conv Rate</p>
                      <p className="text-sm font-medium">{((creative.conversion_rate ?? 0) * 100).toFixed(2)}%</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {(!creatives || creatives.length === 0) && (
            <Card className="col-span-full text-center py-12">
              <p className="text-muted-foreground">No creatives found.</p>
              <Button className="mt-4" onClick={() => setShowGenerate(true)}>Generate your first creative</Button>
            </Card>
          )}
        </div>
      )}

      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} />}
    </div>
  );
}

function GenerateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    campaign_id: '',
    format: 'display_banner',
    prompt: '',
    tone: 'professional',
    variants: '3',
  });

  const generateMutation = useMutation({
    mutationFn: (data: any) => api.generateCreative(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const preset = GENERATION_PRESETS[form.format as keyof typeof GENERATION_PRESETS] ?? GENERATION_PRESETS.display_banner;
    generateMutation.mutate({
      campaignId: form.campaign_id || null,
      type: preset.type,
      prompt: `${form.prompt.trim()}\n\nTone: ${form.tone}.`,
      brandGuidelines: {
        primaryColor: '#16A34A',
        secondaryColor: '#0F172A',
        fontFamily: 'Plus Jakarta Sans',
        tone: form.tone,
        logoUrl: null,
        doNotUse: [],
      },
      targetAudience: 'General marketing audience',
      platform: preset.platform,
      dimensions: preset.dimensions,
      variants: parseInt(form.variants, 10),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Generate Creative</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {generateMutation.error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {generateMutation.error instanceof Error ? generateMutation.error.message : 'Creative generation failed.'}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Format</label>
            <select
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Prompt / Direction</label>
            <textarea
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Describe the creative direction..."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tone</label>
              <select
                value={form.tone}
                onChange={(e) => setForm({ ...form, tone: e.target.value })}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="bold">Bold</option>
                <option value="playful">Playful</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Variants</label>
              <select
                value={form.variants}
                onChange={(e) => setForm({ ...form, variants: e.target.value })}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {[1, 2, 3, 5].map((n) => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={generateMutation.isPending}>
              {generateMutation.isPending ? 'Generating...' : 'Generate'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
