'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';
import { WorkspaceGuidanceBanner } from '@/components/workspace-guidance-banner';

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.getWebhooks(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  return (
    <div className="space-y-6">
      <WorkspaceGuidanceBanner surface="webhooks" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage webhook endpoints for real-time event delivery.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Add Endpoint</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-4 w-2/3 rounded bg-secondary" />
              <div className="mt-2 h-3 w-1/3 rounded bg-secondary" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {(webhooks ?? []).map((webhook: any) => (
            <Card key={webhook.id}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold truncate">{webhook.url}</p>
                    <Badge variant={webhook.active ? 'success' : 'destructive'}>
                      {webhook.active ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(webhook.events ?? []).map((event: string) => (
                      <span key={event} className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ml-4 flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { if (confirm('Delete this webhook endpoint? This cannot be undone.')) deleteMutation.mutate(webhook.id); }}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Deliveries</p>
                  <p className="text-sm font-medium">{webhook.total_deliveries ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                  <p className="text-sm font-medium">
                    {webhook.total_deliveries > 0
                      ? `${(((webhook.successful_deliveries ?? 0) / webhook.total_deliveries) * 100).toFixed(1)}%`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Consecutive Failures</p>
                  <p className={`text-sm font-medium ${(webhook.consecutive_failures ?? 0) > 10 ? 'text-red-400' : ''}`}>
                    {webhook.consecutive_failures ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Delivery</p>
                  <p className="text-sm font-medium">
                    {webhook.last_delivery_at ? new Date(webhook.last_delivery_at).toLocaleString() : 'Never'}
                  </p>
                </div>
              </div>

              {webhook.secret_hash && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400">HMAC Signed</span>
                </div>
              )}
            </Card>
          ))}
          {(!webhooks || webhooks.length === 0) && (
            <Card className="text-center py-12">
              <p className="text-muted-foreground">No webhook endpoints configured.</p>
              <Button className="mt-4" onClick={() => setShowCreate(true)}>Add your first endpoint</Button>
            </Card>
          )}
        </div>
      )}

      {showCreate && <CreateWebhookModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateWebhookModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    url: '',
    events: 'campaign.*',
    secret: '',
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createWebhook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      onClose();
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to create webhook');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try { new URL(form.url); } catch { setError('Invalid URL format'); return; }
    if (!form.url.startsWith('https://')) { setError('Webhook URL must use HTTPS'); return; }
    const events = form.events.split(',').map((s) => s.trim()).filter(Boolean);
    if (events.length === 0) { setError('At least one event is required'); return; }
    createMutation.mutate({
      url: form.url,
      events,
      secret: form.secret || undefined,
    });
  };

  const EVENT_PRESETS = [
    'campaign.*',
    'agent.*',
    'creative.*',
    'analytics.anomaly',
    'onboarding.*',
    '*',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Add Webhook Endpoint</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1">Endpoint URL</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://your-app.com/webhooks"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Events (comma-separated)</label>
            <input
              type="text"
              value={form.events}
              onChange={(e) => setForm({ ...form, events: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="campaign.*, agent.task_completed"
              required
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {EVENT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setForm({ ...form, events: preset })}
                  className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary/80 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Signing Secret (optional)</label>
            <input
              type="password"
              value={form.secret}
              onChange={(e) => setForm({ ...form, secret: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="whsec_..."
            />
            <p className="mt-1 text-xs text-muted-foreground">Used for HMAC-SHA256 signature verification</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding...' : 'Add Endpoint'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
