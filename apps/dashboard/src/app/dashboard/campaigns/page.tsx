'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

const PLATFORMS = ['google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads'] as const;
const STATUSES = ['active', 'paused', 'draft', 'completed'] as const;

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns', filter],
    queryFn: () => api.getCampaigns(filter !== 'all' ? { status: filter } : undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your advertising campaigns across all platforms.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New Campaign</Button>
      </div>

      <div className="flex gap-2">
        {['all', ...STATUSES].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === status ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

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
          {(campaigns ?? []).map((campaign: any) => (
            <Card key={campaign.id}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold">{campaign.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground capitalize">{campaign.platform?.replace('_', ' ')}</p>
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
                  <p className="text-xs text-muted-foreground">Daily Budget</p>
                  <p className="text-sm font-medium">{formatCurrency((campaign.budget as any)?.dailyBudget ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Spend</p>
                  <p className="text-sm font-medium">{formatCurrency(campaign.spend ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Impressions</p>
                  <p className="text-sm font-medium">{(campaign.impressions ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CTR</p>
                  <p className="text-sm font-medium">{((campaign.ctr ?? 0) * 100).toFixed(2)}%</p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">Edit</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteMutation.mutate(campaign.id)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
          {(!campaigns || campaigns.length === 0) && (
            <Card className="col-span-full text-center py-12">
              <p className="text-muted-foreground">No campaigns found.</p>
              <Button className="mt-4" onClick={() => setShowCreate(true)}>Create your first campaign</Button>
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
  const [form, setForm] = useState({ name: '', platform: 'google_ads', daily_budget: '', objective: 'conversions' });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createCampaign(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name: form.name,
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
        <h2 className="text-lg font-semibold mb-4">Create Campaign</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Platform</label>
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
            <label className="block text-sm font-medium mb-1">Daily Budget ($)</label>
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
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
