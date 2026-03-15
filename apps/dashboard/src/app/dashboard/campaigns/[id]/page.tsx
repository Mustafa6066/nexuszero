'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import { useLang } from '@/app/providers';

const PLATFORMS = ['google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads'] as const;

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLang();

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.getCampaign(id),
    enabled: !!id,
  });

  const [form, setForm] = useState<Record<string, any>>({});

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.updateCampaign(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setEditing(false);
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to update campaign');
    },
  });

  const handleSave = () => {
    setError(null);
    const name = (form.name ?? campaign?.name ?? '').trim();
    if (!name) { setError('Campaign name is required'); return; }

    const payload: Record<string, any> = {};
    if (form.name !== undefined) payload.name = form.name.trim();
    if (form.status !== undefined) payload.status = form.status;
    if (form.platform !== undefined) payload.platform = form.platform;
    if (form.daily_budget !== undefined) {
      const budget = parseFloat(form.daily_budget);
      if (!budget || budget <= 0) { setError('Daily budget must be greater than 0'); return; }
      payload.budget = { ...campaign?.budget, dailyBudget: budget };
    }

    updateMutation.mutate(payload);
  };

  const startEditing = () => {
    setForm({
      name: campaign?.name ?? '',
      status: campaign?.status ?? 'draft',
      platform: campaign?.platform ?? 'google_ads',
      daily_budget: String((campaign?.budget as any)?.dailyBudget ?? ''),
    });
    setEditing(true);
    setError(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="animate-pulse">
          <div className="h-6 w-1/3 rounded bg-secondary" />
          <div className="mt-4 h-4 w-2/3 rounded bg-secondary" />
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="h-16 rounded bg-secondary" />
            <div className="h-16 rounded bg-secondary" />
          </div>
        </Card>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="space-y-6">
        <Card className="text-center py-12">
          <p className="text-muted-foreground">{t.campaignDetail.campaignNotFound}</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push('/dashboard/campaigns')}>
            {t.campaignDetail.backToCampaigns}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/campaigns')} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{campaign.platform?.replace('_', ' ')} &middot; {campaign.type}</p>
        </div>
        <Badge variant={
          campaign.status === 'active' ? 'success' :
          campaign.status === 'paused' ? 'warning' :
          campaign.status === 'draft' ? 'outline' : 'default'
        }>
          {campaign.status}
        </Badge>
        {!editing && (
          <Button variant="outline" onClick={startEditing}>{t.campaignDetail.editCampaign}</Button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{error}</div>}

      {editing ? (
        <Card>
          <h3 className="text-sm font-semibold mb-4">{t.campaignDetail.editCampaign}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t.campaignDetail.name}</label>
              <input
                type="text"
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t.campaignDetail.platform}</label>
              <select
                value={form.platform ?? ''}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={form.status ?? ''}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t.campaignDetail.dailyBudget} ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.daily_budget ?? ''}
                onChange={(e) => setForm({ ...form, daily_budget: e.target.value })}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setEditing(false); setError(null); }}>{t.campaignDetail.cancel}</Button>
              <Button className="flex-1" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t.campaignDetail.saving : t.campaignDetail.save}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <h3 className="text-sm font-semibold mb-4">Performance</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">{t.campaignDetail.dailyBudget}</p>
                <p className="text-lg font-semibold">{formatCurrency((campaign.budget as any)?.dailyBudget ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.campaignDetail.spend}</p>
                <p className="text-lg font-semibold">{formatCurrency(campaign.spend ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-lg font-semibold">{formatCurrency(campaign.revenue ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ROAS</p>
                <p className="text-lg font-semibold">{(campaign.roas ?? 0).toFixed(2)}x</p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold mb-4">Engagement</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">{t.campaignDetail.impressions}</p>
                <p className="text-lg font-semibold">{(campaign.impressions ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.campaignDetail.clicks}</p>
                <p className="text-lg font-semibold">{(campaign.clicks ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.campaignDetail.ctr}</p>
                <p className="text-lg font-semibold">{((campaign.ctr ?? 0) * 100).toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.campaignDetail.conversions}</p>
                <p className="text-lg font-semibold">{(campaign.conversions ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold mb-4">Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Bid Strategy</p>
                <p className="text-sm font-medium capitalize">{(campaign.budget as any)?.bidStrategy?.replace(/_/g, ' ') ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Objective</p>
                <p className="text-sm font-medium capitalize">{campaign.type ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Start Date</p>
                <p className="text-sm font-medium">{(campaign.schedule as any)?.startDate ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium">{campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
