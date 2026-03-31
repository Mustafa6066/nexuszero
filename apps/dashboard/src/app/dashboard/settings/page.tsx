'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import { GuardrailsPanel } from '@/components/guardrails-panel';
import { useLang } from '@/app/providers';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.getMe(),
  });

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLang();

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.patch('/tenants/me', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to save settings');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t.settingsPage.heading}</h1>
        </div>
        <Card className="animate-pulse">
          <div className="h-4 w-1/3 rounded bg-secondary" />
          <div className="mt-4 h-10 w-full rounded bg-secondary" />
          <div className="mt-4 h-10 w-full rounded bg-secondary" />
        </Card>
      </div>
    );
  }

  const handleSave = () => {
    setError(null);
    if (form.company_name !== undefined && !(form.company_name as string).trim()) {
      setError('Company name cannot be empty');
      return;
    }
    const payload: Record<string, unknown> = { ...form };
    if (Object.keys(notificationPrefs).length > 0) {
      payload.notification_preferences = {
        ...tenant?.notification_preferences,
        ...notificationPrefs,
      };
    }
    updateMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.settingsPage.heading}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.settingsPage.settingsSubtitle}</p>
        </div>
        {saved && <Badge variant="success">{t.settingsPage.settingsSaved}</Badge>}
        {error && <Badge variant="destructive">{error}</Badge>}
      </div>

      <Card>
        <h3 className="text-sm font-semibold mb-4">{t.settingsPage.organization}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t.settingsPage.companyName}</label>
            <input
              type="text"
              value={(form.company_name as string) ?? tenant?.company_name ?? ''}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t.settingsPage.website}</label>
            <input
              type="url"
              value={(form.website as string) ?? tenant?.website ?? ''}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t.settingsPage.industry}</label>
            <input
              type="text"
              value={(form.industry as string) ?? tenant?.industry ?? ''}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-4">{t.settingsPage.subscription}</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">{t.settingsPage.currentPlan}</p>
            <p className="mt-1 text-lg font-bold capitalize">{tenant?.plan_tier ?? 'starter'}</p>
          </div>
          <Badge variant={tenant?.status === 'active' ? 'success' : 'warning'}>
            {tenant?.status ?? 'unknown'}
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t.settingsPage.maxAgents}</p>
            <p className="text-sm font-medium">{tenant?.config?.max_agents ?? 'Unlimited'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t.settingsPage.maxCampaigns}</p>
            <p className="text-sm font-medium">{tenant?.config?.max_campaigns ?? 'Unlimited'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t.settingsPage.apiRateLimit}</p>
            <p className="text-sm font-medium">{tenant?.config?.rate_limit ?? '100'}/min</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t.settingsPage.created}</p>
            <p className="text-sm font-medium">{tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString() : 'N/A'}</p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-4">{t.settingsPage.oauthIntegrations}</h3>
        <div className="space-y-3">
          {['google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads'].map((platform) => {
            const isConnected = tenant?.oauth_tokens?.[platform]?.access_token;
            return (
              <div key={platform} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium capitalize">{platform.replace('_', ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {isConnected ? 'Connected' : 'Not connected'}
                  </p>
                </div>
                <Badge variant={isConnected ? 'success' : 'outline'}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Agent Guardrails */}
      <GuardrailsPanel />

      <Card>
        <h3 className="text-sm font-semibold mb-4">{t.settingsPage.notificationPreferences}</h3>
        <div className="space-y-3">
          {[
            { key: 'anomaly_alerts', label: t.settingsPage.anomalyAlerts, desc: t.settingsPage.anomalyAlertsDesc },
            { key: 'daily_digest', label: t.settingsPage.dailyDigest, desc: t.settingsPage.dailyDigestDesc },
            { key: 'campaign_updates', label: t.settingsPage.campaignUpdates, desc: t.settingsPage.campaignUpdatesDesc },
            { key: 'agent_errors', label: t.settingsPage.agentErrors, desc: t.settingsPage.agentErrorsDesc },
          ].map((pref) => (
            <div key={pref.key} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">{pref.label}</p>
                <p className="text-xs text-muted-foreground">{pref.desc}</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={notificationPrefs[pref.key] ?? tenant?.notification_preferences?.[pref.key] ?? true}
                  onChange={(e) => setNotificationPrefs({ ...notificationPrefs, [pref.key]: e.target.checked })}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-secondary peer-checked:bg-primary transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? t.settingsPage.saving : t.settingsPage.saveSettings}
        </Button>
      </div>

      {/* AI Models (enterprise only) */}
      {tenant?.plan === 'enterprise' && <AiModelsPanel />}
    </div>
  );
}

function AiModelsPanel() {
  const queryClient = useQueryClient();
  const { data: models } = useQuery({ queryKey: ['models', 'list'], queryFn: () => api.getModels() });
  const { data: configs = [] } = useQuery({ queryKey: ['models', 'config'], queryFn: () => api.getModelConfig() });
  const [editConfig, setEditConfig] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.updateModelConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models', 'config'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const modelOptions: string[] = models?.models?.map((m: any) => m.modelId) ?? [];
  const useCases = ['content_writing', 'analysis', 'assistant'] as const;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">AI Model Configuration</h3>
        {saved && <Badge variant="success">Saved</Badge>}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Configure which AI model is used for each task type. Changes take effect on the next request.
      </p>
      <div className="space-y-4">
        {useCases.map(useCase => {
          const existing = configs.find((c: any) => c.useCase === useCase);
          const current = editConfig[useCase] ?? existing?.primaryModel ?? '';
          return (
            <div key={useCase} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium capitalize">{useCase.replace(/_/g, ' ')}</p>
                {existing?.primaryModel && (
                  <p className="text-xs text-muted-foreground">{existing.primaryModel}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded border px-2 py-1 text-sm bg-background min-w-[200px]"
                  value={current}
                  onChange={e => setEditConfig(c => ({ ...c, [useCase]: e.target.value }))}
                >
                  <option value="">Default (Claude Sonnet)</option>
                  {modelOptions.map((m: string) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!editConfig[useCase] || updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ useCase, primaryModel: editConfig[useCase] })}
                >
                  Save
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
