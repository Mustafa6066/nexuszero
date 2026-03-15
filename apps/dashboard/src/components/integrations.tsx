'use client';

import { useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
  active: 'success',
  degraded: 'warning',
  error: 'destructive',
  disconnected: 'outline',
  pending: 'outline',
};

const PLATFORM_LABELS: Record<string, string> = {
  google_analytics: 'Google Analytics',
  google_ads: 'Google Ads',
  google_search_console: 'Google Search Console',
  meta_ads: 'Meta Ads',
  linkedin_ads: 'LinkedIn Ads',
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  wordpress: 'WordPress',
  webflow: 'Webflow',
  contentful: 'Contentful',
  shopify: 'Shopify',
  slack: 'Slack',
  sendgrid: 'SendGrid',
  stripe_connect: 'Stripe',
  mixpanel: 'Mixpanel',
  amplitude: 'Amplitude',
};

function HealthBar({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const color =
    pct >= 80 ? 'bg-green-500' :
    pct >= 50 ? 'bg-yellow-500' :
    'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-muted">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

/** Handle the connect response — redirect for OAuth, show prompt for API key */
function handleConnectResponse(response: any, setApiKeyTarget: (v: { platform: string; label: string } | null) => void) {
  if (!response) return;
  if (response.status === 'redirect' && response.authUrl) {
    window.location.href = response.authUrl;
    return;
  }
  if (response.status === 'needs_credentials') {
    setApiKeyTarget({ platform: response.platform, label: response.label ?? response.platform });
    return;
  }
  if (response.status === 'not_configured') {
    alert(response.message || `OAuth credentials for ${response.label ?? response.platform} are not configured.`);
  }
}

/** API Key Input Modal */
function ApiKeyModal({ target, onClose, onSubmit, isPending }: {
  target: { platform: string; label: string };
  onClose: () => void;
  onSubmit: (platform: string, apiKey: string) => void;
  isPending: boolean;
}) {
  const [apiKey, setApiKey] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Connect {target.label}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your API key to connect {target.label} to NexusZero.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your API key here"
          className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
        />
        <div className="mt-4 flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary/60">
            Cancel
          </button>
          <button
            onClick={() => { if (apiKey.trim()) onSubmit(target.platform, apiKey.trim()); }}
            disabled={isPending || !apiKey.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function IntegrationGrid() {
  const queryClient = useQueryClient();
  const { status } = useSession();
  const searchParams = useSearchParams();
  const [apiKeyTarget, setApiKeyTarget] = useState<{ platform: string; label: string } | null>(null);

  const connectedParam = searchParams.get('connected');
  const errorParam = searchParams.get('error');

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.getIntegrations(),
    enabled: status === 'authenticated',
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });

  const disconnectMutation = useMutation({
    mutationFn: (platform: string) => api.disconnectIntegration(platform),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const reconnectMutation = useMutation({
    mutationFn: (platform: string) => api.reconnectIntegration(platform),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const connectMutation = useMutation({
    mutationFn: (platform: string) => api.connectIntegration(platform),
    onSuccess: (data: any) => {
      handleConnectResponse(data, setApiKeyTarget);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const apiKeyMutation = useMutation({
    mutationFn: ({ platform, apiKey }: { platform: string; apiKey: string }) =>
      api.post<any>('/integrations/connect/api-key', { platform, apiKey }),
    onSuccess: () => {
      setApiKeyTarget(null);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const sortedIntegrations = useMemo(() => {
    const priority = { error: 0, degraded: 1, disconnected: 2, pending: 3, active: 4 } as Record<string, number>;
    return [...(integrations ?? [])].sort((left: any, right: any) => {
      const leftPriority = priority[left.status] ?? 99;
      const rightPriority = priority[right.status] ?? 99;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return String(left.platform).localeCompare(String(right.platform));
    });
  }, [integrations]);

  if (isLoading) {
    return <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => (
      <Card key={i} className="animate-pulse h-32"><div /></Card>
    ))}</div>;
  }

  if (!integrations?.length) {
    return (
      <>
        <Card className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">No integrations connected yet.</p>
          <p className="text-sm text-muted-foreground">Start onboarding to detect and connect your tools, or connect platforms manually.</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {(['google_analytics', 'google_search_console', 'google_ads', 'meta_ads'] as const).map((platform) => (
              <button
                key={platform}
                onClick={() => connectMutation.mutate(platform)}
                disabled={connectMutation.isPending}
                className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
              >
                Connect {PLATFORM_LABELS[platform] ?? platform}
              </button>
            ))}
          </div>
        </Card>
        {apiKeyTarget && (
          <ApiKeyModal
            target={apiKeyTarget}
            onClose={() => setApiKeyTarget(null)}
            onSubmit={(platform, apiKey) => apiKeyMutation.mutate({ platform, apiKey })}
            isPending={apiKeyMutation.isPending}
          />
        )}
      </>
    );
  }

  return (
    <>
    {connectedParam && (
      <div className="mb-4 rounded-md bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-400">
        Successfully connected {PLATFORM_LABELS[connectedParam] ?? connectedParam}! The integration is being validated.
      </div>
    )}
    {errorParam && (
      <div className="mb-4 rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
        Connection failed: {errorParam}
      </div>
    )}
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sortedIntegrations.map((integration: any) => (
        <Card key={integration.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">
              {PLATFORM_LABELS[integration.platform] ?? integration.platform}
            </h3>
            <Badge variant={STATUS_BADGE[integration.status] ?? 'outline'}>
              {integration.status}
            </Badge>
          </div>

          <HealthBar score={integration.healthScore} />

          {integration.config?.detectedConfidence != null && (
            <p className="text-xs text-muted-foreground">
              Detected automatically with {Math.round(Number(integration.config.detectedConfidence) * 100)}% confidence.
            </p>
          )}

          {integration.lastHealthCheck && (
            <p className="text-xs text-muted-foreground">
              Last check: {new Date(integration.lastHealthCheck).toLocaleString()}
            </p>
          )}

          <div className="flex gap-2 mt-auto pt-2">
            {integration.status === 'disconnected' && (
              <button
                onClick={() => connectMutation.mutate(integration.platform)}
                disabled={connectMutation.isPending}
                className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {connectMutation.isPending ? 'Queueing…' : 'Connect'}
              </button>
            )}
            {integration.status === 'degraded' && (
              <button
                onClick={() => reconnectMutation.mutate(integration.platform)}
                disabled={reconnectMutation.isPending}
                className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Reconnect
              </button>
            )}
            {integration.status === 'error' && (
              <button
                onClick={() => reconnectMutation.mutate(integration.platform)}
                disabled={reconnectMutation.isPending}
                className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Reconnect
              </button>
            )}
            {integration.status !== 'disconnected' && (
              <button
                onClick={() => disconnectMutation.mutate(integration.platform)}
                disabled={disconnectMutation.isPending}
                className="text-xs px-3 py-1 rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
          </div>
        </Card>
      ))}
    </div>
    {apiKeyTarget && (
      <ApiKeyModal
        target={apiKeyTarget}
        onClose={() => setApiKeyTarget(null)}
        onSubmit={(platform, apiKey) => apiKeyMutation.mutate({ platform, apiKey })}
        isPending={apiKeyMutation.isPending}
      />
    )}
    </>
  );
}

export function OnboardingWizard() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [apiKeyTarget, setApiKeyTarget] = useState<{ platform: string; label: string } | null>(null);

  const { data: tenant } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.getMe(),
    staleTime: 60_000,
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations', 'connection-workspace'],
    queryFn: () => api.getIntegrations(),
    staleTime: 60_000,
  });

  const { data: intelligence } = useQuery({
    queryKey: ['intelligence', 'summary', 'connection-workspace'],
    queryFn: () => api.getIntelligenceSummary(),
    staleTime: 60_000,
  });

  const onboardingState = tenant?.onboardingState ?? tenant?.onboarding_state ?? 'created';
  const onboardingComplete = ['active', 'completed', 'live'].includes(onboardingState);

  const detectMutation = useMutation({
    mutationFn: (websiteUrl: string) => api.startOnboarding(websiteUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const completeMutation = useMutation({
    mutationFn: () => api.completeOnboarding(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const connectMutation = useMutation({
    mutationFn: (platform: string) => api.connectIntegration(platform),
    onSuccess: (data: any) => {
      handleConnectResponse(data, setApiKeyTarget);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'connection-workspace'] });
    },
  });

  const apiKeyMutation = useMutation({
    mutationFn: ({ platform, apiKey }: { platform: string; apiKey: string }) =>
      api.post<any>('/integrations/connect/api-key', { platform, apiKey }),
    onSuccess: () => {
      setApiKeyTarget(null);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'connection-workspace'] });
    },
  });

  const activateAgentsMutation = useMutation({
    mutationFn: (agentTypes: string[]) =>
      api.post<any>('/integrations/activate-agents', { agentTypes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: (platform: string) => api.reconnectIntegration(platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'connection-workspace'] });
    },
  });

  const detections = (detectMutation.data as any)?.detections ?? [];
  const hasDetections = detections.length > 0;
  const isSpa = (detectMutation.data as any)?.isSpa ?? false;
  const detectedFramework = (detectMutation.data as any)?.detectedFramework ?? null;
  const recommendedPlatforms = (detectMutation.data as any)?.recommendedPlatforms as string[] | undefined;
  const disconnectedIntegrations = (integrations ?? []).filter((integration: any) => integration.status === 'disconnected');
  const degradedIntegrations = (integrations ?? []).filter((integration: any) => ['degraded', 'error'].includes(integration.status));

  if (!onboardingComplete) {
    return (
      <Card className="space-y-4 rounded-[1.5rem] border-primary/15 bg-[linear-gradient(135deg,hsl(var(--card)/0.92),hsl(var(--background)/0.84))]">
        <div>
          <h2 className="text-lg font-semibold">Setup Is Still In Progress</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Integrations are managed here after onboarding, but the guided onboarding shell is the right place to finish setup and move into your first mission.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => router.push('/dashboard/onboarding')}>Resume onboarding</Button>
          <Button variant="outline" onClick={() => router.push('/dashboard/scanner')}>Open deep scan</Button>
          <Button
            variant="outline"
            onClick={() => activateAgentsMutation.mutate(['seo', 'aeo'])}
            disabled={activateAgentsMutation.isPending}
          >
            {activateAgentsMutation.isPending ? 'Activating…' : 'Activate SEO & AEO Agents'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
    <Card className="space-y-5 rounded-[1.6rem] border-border/60 bg-card/70">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Connection Workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Refresh discovery, queue new integrations, and keep the post-onboarding stack aligned to the next mission.
          </p>
        </div>
        <div className="rounded-xl border border-primary/15 bg-primary/8 px-3 py-2 text-xs text-muted-foreground">
          {intelligence?.dashboard?.surfaceGuidance?.integrations ?? 'Connect the next highest-value platform to improve automation quality.'}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Refresh discovery</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Run another stack pass to detect platforms that may have been added since the initial setup.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const url = new FormData(form).get('websiteUrl') as string;
              if (url) detectMutation.mutate(url);
            }}
            className="flex gap-2"
          >
            <input
              name="websiteUrl"
              type="url"
              required
              defaultValue={tenant?.website ?? tenant?.domain ?? ''}
              placeholder="https://yoursite.com"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={detectMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {detectMutation.isPending ? 'Detecting...' : 'Refresh stack'}
            </button>
          </form>

          {detectMutation.isSuccess && hasDetections && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
              <div className="font-medium">Detected {detections.length} platform{detections.length > 1 ? 's' : ''} in the latest scan.</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {detections.map((detection: any) => (
                  <button
                    key={detection.platform}
                    type="button"
                    onClick={() => connectMutation.mutate(detection.platform)}
                    disabled={connectMutation.isPending}
                    className="rounded-full border border-green-500/25 bg-green-500/10 px-3 py-1 text-xs text-green-200 transition-colors hover:bg-green-500/15 disabled:opacity-50"
                  >
                    Queue {PLATFORM_LABELS[detection.platform] ?? detection.platform}
                  </button>
                ))}
              </div>
            </div>
          )}

          {detectMutation.isSuccess && !hasDetections && (
            <div className="space-y-3">
              <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-4 text-sm">
                <p className="font-medium text-yellow-300">
                  {isSpa
                    ? `${detectedFramework ?? 'SPA'} detected — scripts load dynamically`
                    : 'No new integrations auto-detected'}
                </p>
                <p className="text-muted-foreground mt-1">
                  {(detectMutation.data as any)?.message ||
                    "No tracking tags detected in page HTML. You can still connect integrations manually below."}
                </p>
              </div>

              {/* Manual connect buttons for recommended platforms */}
              {recommendedPlatforms && recommendedPlatforms.length > 0 && (
                <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                  <p className="text-sm font-medium mb-3">Connect manually</p>
                  <div className="flex flex-wrap gap-2">
                    {recommendedPlatforms.map((platform: string) => (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => connectMutation.mutate(platform)}
                        disabled={connectMutation.isPending}
                        className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                      >
                        Connect {PLATFORM_LABELS[platform] ?? platform}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => router.push('/dashboard/scanner')}
                  className="rounded-lg border border-border bg-secondary/30 p-3 text-left hover:bg-secondary/60 transition-colors"
                >
                  <p className="text-sm font-medium">Run Deep Scan</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Full pre-flight analysis with SEO, security, and performance checks
                  </p>
                </button>
                <button
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}
                  className="rounded-lg border border-border bg-secondary/30 p-3 text-left hover:bg-secondary/60 transition-colors"
                >
                  <p className="text-sm font-medium">Refresh post-onboarding state</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Re-run the completion step to keep the workspace state synchronized
                  </p>
                </button>
              </div>
            </div>
          )}

          {detectMutation.isError && (
            <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">
              {(detectMutation.error as Error)?.message || 'Detection failed. Please check the URL and try again.'}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Suggested actions</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Prioritized from your current connection state and intelligence profile.
            </p>
          </div>

          <div className="space-y-3">
            {degradedIntegrations.slice(0, 2).map((integration: any) => (
              <div key={integration.platform} className="rounded-xl border border-yellow-500/20 bg-yellow-500/8 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Reconnect {PLATFORM_LABELS[integration.platform] ?? integration.platform}</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {intelligence?.dashboard?.healthWarnings?.[0] ?? 'This platform is reducing the reliability of recommendations and automations.'}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => reconnectMutation.mutate(integration.platform)} disabled={reconnectMutation.isPending}>
                    Queue reconnect
                  </Button>
                </div>
              </div>
            ))}

            {disconnectedIntegrations.slice(0, 3).map((integration: any) => (
              <div key={integration.platform} className="rounded-xl border border-border/60 bg-secondary/25 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Connect {PLATFORM_LABELS[integration.platform] ?? integration.platform}</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {intelligence?.dashboard?.surfaceGuidance?.integrations ?? 'Add the next platform to increase context depth and automation quality.'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => connectMutation.mutate(integration.platform)} disabled={connectMutation.isPending}>
                    Queue connect
                  </Button>
                </div>
              </div>
            ))}

            {disconnectedIntegrations.length === 0 && degradedIntegrations.length === 0 && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/8 p-4 text-sm text-muted-foreground">
                Your current connection layer is stable. Use refresh discovery when you add a new platform or tracking system.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agent Activation Section */}
      <div className="border-t border-border/40 pt-4 mt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Activate AI Agents</h3>
            <p className="text-xs text-muted-foreground mt-1">
              SEO and AEO agents can work immediately using your website content — no integrations required.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => activateAgentsMutation.mutate(['seo'])}
              disabled={activateAgentsMutation.isPending}
            >
              Activate SEO
            </Button>
            <Button
              size="sm"
              onClick={() => activateAgentsMutation.mutate(['aeo'])}
              disabled={activateAgentsMutation.isPending}
            >
              Activate AEO
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => activateAgentsMutation.mutate(['seo', 'aeo', 'data-nexus', 'ad', 'creative'])}
              disabled={activateAgentsMutation.isPending}
            >
              Activate All
            </Button>
          </div>
        </div>
        {activateAgentsMutation.isSuccess && (
          <div className="mt-2 rounded-md bg-green-500/10 border border-green-500/20 p-2 text-xs text-green-400">
            {(activateAgentsMutation.data as any)?.message ?? 'Agents activated successfully.'}
          </div>
        )}
      </div>
    </Card>

    {apiKeyTarget && (
      <ApiKeyModal
        target={apiKeyTarget}
        onClose={() => setApiKeyTarget(null)}
        onSubmit={(platform, apiKey) => apiKeyMutation.mutate({ platform, apiKey })}
        isPending={apiKeyMutation.isPending}
      />
    )}
    </>
  );
}
