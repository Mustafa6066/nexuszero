'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { WorkspaceGuidanceBanner } from '@/components/workspace-guidance-banner';
import { FilterBar, BulkActionsBar } from '@/components/filter-bar';
import { useFilters, useBulkSelection } from '@/hooks/use-filters';
import { useLang } from '@/app/providers';
import { Pause, Play, Trash2 } from 'lucide-react';

const PLATFORMS = ['google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads'] as const;
const STATUSES = ['active', 'paused', 'draft', 'completed'] as const;

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useLang();
  const { filters, setFilter, clearFilters, activeCount, toParams } = useFilters<{ status: string; platform: string }>();
  const { selected, selectedCount, toggle, selectAll, clearSelection, isSelected, selectedArray } = useBulkSelection();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreate(true);
    }
  }, [searchParams]);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns', filters],
    queryFn: () => api.getCampaigns(toParams()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) => api.bulkUpdateCampaignStatus(ids, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); clearSelection(); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkDeleteCampaigns(ids),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); clearSelection(); },
  });

  const filterGroups = [
    { key: 'status', label: 'Status', options: [{ value: 'all', label: t.campaignsPage.filterAll }, ...STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))] },
    { key: 'platform', label: 'Platform', options: [{ value: 'all', label: 'All' }, ...PLATFORMS.map(p => ({ value: p, label: p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))] },
  ];

  return (
    <div className="space-y-6">
      <WorkspaceGuidanceBanner surface="campaigns" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.campaignsPage.heading}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.campaignsPage.manageSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/campaigns/compare')}>{t.campaignsPage.compare}</Button>
          <Button onClick={() => setShowCreate(true)}>+ {t.campaignsPage.newCampaign}</Button>
        </div>
      </div>

      <FilterBar
        groups={filterGroups}
        filters={filters}
        onFilterChange={(key, value) => setFilter(key as any, value as any)}
        onClear={clearFilters}
        activeCount={activeCount}
      />

      <BulkActionsBar selectedCount={selectedCount} onClear={clearSelection}>
        <Button size="sm" variant="outline" onClick={() => bulkStatusMutation.mutate({ ids: selectedArray, status: 'active' })} disabled={bulkStatusMutation.isPending}>
          <Play className="h-3 w-3 mr-1" /> Activate
        </Button>
        <Button size="sm" variant="outline" onClick={() => bulkStatusMutation.mutate({ ids: selectedArray, status: 'paused' })} disabled={bulkStatusMutation.isPending}>
          <Pause className="h-3 w-3 mr-1" /> Pause
        </Button>
        <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${selectedCount} campaigns?`)) bulkDeleteMutation.mutate(selectedArray); }} disabled={bulkDeleteMutation.isPending}>
          <Trash2 className="h-3 w-3 mr-1" /> Delete
        </Button>
      </BulkActionsBar>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-4 w-2/3 rounded bg-secondary" />
              <div className="mt-3 h-3 w-1/3 rounded bg-secondary" />
              <div className="mt-6 h-8 w-full rounded bg-secondary" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns && campaigns.length > 0 && (
            <div className="col-span-full flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCount === campaigns.length && campaigns.length > 0}
                  onChange={(e) => e.target.checked ? selectAll(campaigns.map((c: any) => c.id)) : clearSelection()}
                  className="rounded"
                />
                Select all ({campaigns.length})
              </label>
            </div>
          )}
          {(campaigns ?? []).map((campaign: any) => (
            <Card key={campaign.id} className={isSelected(campaign.id) ? 'ring-2 ring-primary' : ''}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={isSelected(campaign.id)}
                    onChange={() => toggle(campaign.id)}
                    className="mt-0.5 rounded"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{campaign.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground capitalize">{campaign.platform?.replace('_', ' ')}</p>
                  </div>
                </div>
                <Badge variant={
                  campaign.status === 'active' ? 'success' :
                  campaign.status === 'paused' ? 'warning' :
                  campaign.status === 'draft' ? 'outline' : 'default'
                }>
                  {campaign.status}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t.campaignsPage.dailyBudget}</p>
                  <p className="text-sm font-medium">{formatCurrency((campaign.budget as any)?.dailyBudget ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.campaignsPage.totalSpend}</p>
                  <p className="text-sm font-medium">{formatCurrency(campaign.spend ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.campaignsPage.impressions}</p>
                  <p className="text-sm font-medium">{(campaign.impressions ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.campaignsPage.ctr}</p>
                  <p className="text-sm font-medium">{((campaign.ctr ?? 0) * 100).toFixed(2)}%</p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => router.push(`/dashboard/campaigns/${campaign.id}`)}>{t.common.edit}</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { if (confirm(t.campaignsPage.deleteConfirm)) deleteMutation.mutate(campaign.id); }}
                  disabled={deleteMutation.isPending}
                >
                  {t.common.delete}
                </Button>
              </div>
            </Card>
          ))}
          {(!campaigns || campaigns.length === 0) && (
            <Card className="col-span-full text-center py-12">
              <p className="text-muted-foreground">{t.campaignsPage.noCampaigns}</p>
              <Button className="mt-4" onClick={() => setShowCreate(true)}>{t.campaignsPage.createFirst}</Button>
            </Card>
          )}
        </div>
      )}

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { t } = useLang();
  const [form, setForm] = useState({ name: '', platform: 'google_ads', daily_budget: '', objective: 'conversions' });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createCampaign(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to create campaign');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Campaign name is required'); return; }
    const budget = parseFloat(form.daily_budget);
    if (!budget || budget <= 0) { setError('Daily budget must be greater than 0'); return; }
    createMutation.mutate({
      name: form.name.trim(),
      type: 'ppc',
      platform: form.platform,
      budget: {
        dailyBudget: parseFloat(form.daily_budget) || 0,
        bidStrategy: 'maximize_conversions',
      },
      targeting: {},
      schedule: { startDate: new Date().toISOString().slice(0, 10) },
      config: {},
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{t.campaignsPage.createTitle}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1">{t.campaignsPage.name}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t.campaignsPage.platform}</label>
            <select
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t.campaignsPage.dailyBudget} ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.daily_budget}
              onChange={(e) => setForm({ ...form, daily_budget: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>{t.common.cancel}</Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? t.campaignsPage.creating : t.common.create}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
