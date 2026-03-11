'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge } from '@/components/ui';

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

export function IntegrationGrid() {
  const queryClient = useQueryClient();
  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.getIntegrations(),
    refetchInterval: 30_000,
  });

  const disconnectMutation = useMutation({
    mutationFn: (platform: string) => api.disconnectIntegration(platform),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const reconnectMutation = useMutation({
    mutationFn: (platform: string) => api.reconnectIntegration(platform),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  if (isLoading) {
    return <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => (
      <Card key={i} className="animate-pulse h-32" />
    ))}</div>;
  }

  if (!integrations?.length) {
    return (
      <Card className="text-center py-12">
        <p className="text-muted-foreground">No integrations connected yet.</p>
        <p className="text-sm text-muted-foreground mt-1">Start onboarding to detect and connect your tools.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {integrations.map((integration: any) => (
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

          {integration.lastHealthCheck && (
            <p className="text-xs text-muted-foreground">
              Last check: {new Date(integration.lastHealthCheck).toLocaleString()}
            </p>
          )}

          <div className="flex gap-2 mt-auto pt-2">
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
  );
}

export function OnboardingWizard() {
  const queryClient = useQueryClient();

  const detectMutation = useMutation({
    mutationFn: (websiteUrl: string) => api.startOnboarding(websiteUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const completeMutation = useMutation({
    mutationFn: () => api.completeOnboarding(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Quick Setup</h2>
      <p className="text-sm text-muted-foreground">
        Enter your website URL to automatically detect your tech stack and connect integrations.
      </p>

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
          placeholder="https://yoursite.com"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={detectMutation.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {detectMutation.isPending ? 'Detecting...' : 'Detect Stack'}
        </button>
      </form>

      {detectMutation.isSuccess && (
        <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-400">
          Detection started! Check back shortly for results.
          <button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="ml-4 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
          >
            Complete Onboarding
          </button>
        </div>
      )}

      {detectMutation.isError && (
        <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">
          Detection failed. Please check the URL and try again.
        </div>
      )}
    </Card>
  );
}
