'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Bot, Link2, Rocket, Sparkles, Workflow } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, Button, Card } from '@/components/ui';
import { useAssistantActions } from '@/hooks/use-assistant';
import { useLang } from '@/app/providers';

type Surface = 'campaigns' | 'agents' | 'integrations' | 'analytics' | 'creatives' | 'aeo' | 'webhooks';

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

function getOnboardingState(tenant: any): string {
  return tenant?.onboardingState ?? tenant?.onboarding_state ?? 'created';
}

function isOnboardingComplete(state: string): boolean {
  return ['active', 'completed', 'live'].includes(state);
}

export function WorkspaceGuidanceBanner({ surface }: { surface: Surface }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { open, sendMessage } = useAssistantActions();
  const { t } = useLang();

  const { data: tenant } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.getMe(),
    staleTime: 60_000,
  });

  const { data: intelligence } = useQuery({
    queryKey: ['intelligence', 'summary', 'guidance-banner'],
    queryFn: () => api.getIntelligenceSummary(),
    staleTime: 60_000,
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations', 'guidance-banner'],
    queryFn: () => api.getIntegrations(),
    staleTime: 60_000,
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns', 'guidance-banner'],
    queryFn: () => api.getCampaigns({ limit: '5' }),
    staleTime: 60_000,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents', 'guidance-banner'],
    queryFn: () => api.getAgents(),
    staleTime: 60_000,
  });

  const connectMutation = useMutation({
    mutationFn: (platform: string) => api.connectIntegration(platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'guidance-banner'] });
    },
  });

  const guidance = useMemo(() => {
    const onboardingState = getOnboardingState(tenant);
    const disconnected = (integrations ?? []).filter((integration: any) => integration.status === 'disconnected');
    const degraded = (integrations ?? []).filter((integration: any) => ['degraded', 'error'].includes(integration.status));
    const activeAgents = (agents ?? []).filter((agent: any) => ['active', 'processing'].includes(agent.status));
    const firstDisconnected = disconnected[0];

    if (!isOnboardingComplete(onboardingState)) {
      return {
        icon: Rocket,
        eyebrow: t.workspaceGuidance.resumeSetup,
        title: t.workspaceGuidance.inSetupMode,
        detail: `Resume the onboarding shell to connect the stack, provision the workspace, and move into a first mission instead of configuring things by hand.${intelligence?.journey?.onboardingProgress != null ? ` Progress: ${intelligence.journey.onboardingProgress}%.` : ''}`,
        cta: t.workspaceGuidance.resumeOnboarding,
        action: () => router.push('/dashboard/onboarding'),
        tone: 'primary' as const,
      };
    }

    if (surface === 'integrations' && firstDisconnected) {
      return {
        icon: Link2,
        eyebrow: t.workspaceGuidance.nextUnlock,
        title: `Queue ${PLATFORM_LABELS[firstDisconnected.platform] ?? firstDisconnected.platform} for connection.`,
        detail: intelligence?.dashboard?.surfaceGuidance?.integrations ?? 'This is the fastest way to deepen the workspace context without restarting setup.',
        cta: connectMutation.isPending ? t.workspaceGuidance.queueing : t.workspaceGuidance.queueConnection,
        action: () => connectMutation.mutate(firstDisconnected.platform),
        tone: 'primary' as const,
      };
    }

    if (degraded.length > 0) {
      return {
        icon: AlertTriangle,
        eyebrow: t.workspaceGuidance.riskWatch,
        title: `${degraded.length} integration${degraded.length > 1 ? 's are' : ' is'} limiting decision quality.`,
        detail: intelligence?.dashboard?.healthWarnings?.[0] ?? 'Review connection health before asking the agents to optimize against stale or incomplete data.',
        cta: t.workspaceGuidance.reviewIntegrations,
        action: () => router.push('/dashboard/integrations'),
        tone: 'warning' as const,
      };
    }

    if (surface === 'campaigns' && (!campaigns || campaigns.length === 0)) {
      return {
        icon: Sparkles,
        eyebrow: t.workspaceGuidance.firstMission,
        title: 'Create the first campaign and let NexusZero benchmark performance.',
        detail: intelligence?.dashboard?.surfaceGuidance?.campaigns ?? 'Once one campaign is live, the platform can move from diagnostics into optimization and creative feedback loops.',
        cta: t.workspaceGuidance.createCampaign,
        action: () => router.push('/dashboard/campaigns?create=true'),
        tone: 'primary' as const,
      };
    }

    if (surface === 'agents' && (!agents || agents.length === 0 || activeAgents.length === 0)) {
      return {
        icon: Workflow,
        eyebrow: t.workspaceGuidance.agentPlanning,
        title: 'Use NexusAI to decide which agent mix should run next.',
        detail: intelligence?.dashboard?.surfaceGuidance?.agents ?? 'The platform has enough context to propose the highest-value agent configuration based on your stack and current activity.',
        cta: t.workspaceGuidance.askForAgentPlan,
        action: () => {
          open();
          void sendMessage('Recommend the right agent mix for my current workspace, explain why, and tell me what to activate next.');
        },
        tone: 'primary' as const,
      };
    }

    if (surface === 'integrations' && (!integrations || integrations.length === 0)) {
      return {
        icon: Link2,
        eyebrow: t.workspaceGuidance.firstMission,
        title: 'Start with one analytics or ad-platform connection.',
        detail: intelligence?.dashboard?.surfaceGuidance?.integrations ?? 'A single high-value connection is enough to improve attribution confidence and unlock the next automation layer.',
        cta: t.workspaceGuidance.openOnboarding,
        action: () => router.push('/dashboard/onboarding'),
        tone: 'primary' as const,
      };
    }

    return {
      icon: Bot,
      eyebrow: t.workspaceGuidance.guidedNextStep,
      title: 'Ask NexusAI for the highest-impact move on this surface.',
        detail: intelligence?.dashboard?.surfaceGuidance?.[surface] ?? 'Use the live context from this page instead of manually reviewing every card and table.',
      cta: t.workspaceGuidance.askNexusAI,
      action: () => {
        open();
        void sendMessage(`Give me the next best action for the ${surface} page based on the current workspace state.`);
      },
      tone: 'neutral' as const,
    };
  }, [agents, campaigns, connectMutation, intelligence, integrations, open, router, sendMessage, surface, t, tenant]);

  const Icon = guidance.icon;
  const toneClasses = guidance.tone === 'warning'
    ? 'border-yellow-500/25 bg-[linear-gradient(135deg,hsl(var(--card)/0.9),rgba(234,179,8,0.06))]'
    : guidance.tone === 'neutral'
    ? 'border-border bg-card/70'
    : 'border-primary/15 bg-[linear-gradient(135deg,hsl(var(--card)/0.92),hsl(var(--background)/0.84))]';

  return (
    <Card className={`rounded-[1.6rem] p-5 sm:p-6 ${toneClasses}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
            <Icon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">{guidance.eyebrow}</p>
              {connectMutation.isSuccess && surface === 'integrations' && (
                <Badge variant="success">Queued</Badge>
              )}
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">{guidance.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{guidance.detail}</p>
          </div>
        </div>

        <Button onClick={guidance.action} disabled={connectMutation.isPending} className="shrink-0 gap-1.5">
          {guidance.cta}
          <ArrowRight size={14} />
        </Button>
      </div>
    </Card>
  );
}