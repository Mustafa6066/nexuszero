'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Bot, Link2, PlayCircle, Rocket, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { useAssistantActions } from '@/hooks/use-assistant';
import { useLang } from '@/app/providers';

function getOnboardingState(tenant: any): string {
  return tenant?.onboardingState ?? tenant?.onboarding_state ?? tenant?.status ?? 'created';
}

function isOnboardingComplete(state: string): boolean {
  return ['active', 'completed', 'live'].includes(state);
}

export function MissionRail() {
  const router = useRouter();
  const { open, sendMessage } = useAssistantActions();
  const { t } = useLang();

  const { data: tenant } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.getMe(),
    staleTime: 60_000,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    staleTime: 60_000,
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns', 'mission-rail'],
    queryFn: () => api.getCampaigns({ limit: '3' }),
    staleTime: 60_000,
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations', 'mission-rail'],
    queryFn: () => api.getIntegrations(),
    staleTime: 60_000,
  });

  const { data: intelligence } = useQuery({
    queryKey: ['intelligence', 'summary', 'mission-rail'],
    queryFn: () => api.getIntelligenceSummary(),
    staleTime: 60_000,
  });

  const recommendation = useMemo(() => {
    const onboardingState = getOnboardingState(tenant);
    const activeAgents = (agents ?? []).filter((agent: any) => ['active', 'processing'].includes(agent.status));
    const degradedIntegrations = (integrations ?? []).filter((integration: any) => ['error', 'degraded'].includes(integration.status));
    const connectedIntegrations = (integrations ?? []).filter((integration: any) => integration.status !== 'disconnected');
    const hasCampaigns = (campaigns?.length ?? 0) > 0;

    if (!isOnboardingComplete(onboardingState)) {
      return {
        icon: Rocket,
        eyebrow: t.missionRail.onboardingMission,
        title: t.missionRail.finishSetup,
        detail: intelligence?.dashboard?.nextActions?.[0] ?? 'Your workspace is partially configured. Resume onboarding to connect your stack and deploy the first agent mix.',
        cta: t.missionRail.resumeSetup,
        action: () => router.push('/dashboard/onboarding'),
      };
    }

    if (degradedIntegrations.length > 0) {
      return {
        icon: AlertTriangle,
        eyebrow: t.missionRail.attentionRequired,
        title: t.missionRail.integrationsNeedAttention(degradedIntegrations.length),
        detail: intelligence?.dashboard?.healthWarnings?.[0] ?? 'Reconnect degraded platforms before the agents make optimization decisions with stale data.',
        cta: t.missionRail.reviewIntegrations,
        action: () => router.push('/dashboard/integrations'),
      };
    }

    if (connectedIntegrations.length === 0) {
      return {
        icon: Link2,
        eyebrow: t.missionRail.unlockMoreValue,
        title: t.missionRail.connectStack,
        detail: intelligence?.dashboard?.surfaceGuidance?.integrations ?? 'Add analytics or ad platforms so NexusZero can move from diagnostics into optimization.',
        cta: t.missionRail.connectPlatforms,
        action: () => router.push('/dashboard/integrations'),
      };
    }

    if (!hasCampaigns) {
      return {
        icon: PlayCircle,
        eyebrow: t.missionRail.nextBestMove,
        title: t.missionRail.createFirstCampaign,
        detail: intelligence?.dashboard?.surfaceGuidance?.campaigns ?? 'A live campaign gives Data Nexus, Ad Agent, and Creatives enough signal to start producing recommendations.',
        cta: t.missionRail.openCampaigns,
        action: () => router.push('/dashboard/campaigns?create=true'),
      };
    }

    if (activeAgents.length === 0) {
      return {
        icon: Sparkles,
        eyebrow: t.missionRail.guidedAction,
        title: t.missionRail.askNexusAIOptimization,
        detail: intelligence?.dashboard?.surfaceGuidance?.agents ?? 'Your stack is connected, but no agents are currently running. Pull a fresh recommendation from the intelligence layer.',
        cta: t.missionRail.askNexusAI,
        action: () => {
          open();
          void sendMessage('Based on my current workspace, what should I do next to improve performance?');
        },
      };
    }

    return {
      icon: Bot,
      eyebrow: t.missionRail.systemLive,
      title: t.missionRail.agentsWorking(activeAgents.length),
      detail: intelligence?.dashboard?.surfaceGuidance?.overview ?? 'Review live activity and recent changes, or ask NexusAI to summarize the strongest win opportunity across your current campaigns.',
      cta: t.missionRail.openAgentFleet,
      action: () => router.push('/dashboard/agents'),
    };
  }, [agents, campaigns, intelligence, integrations, open, router, sendMessage, t, tenant]);

  const Icon = recommendation.icon;

  return (
    <section className="relative overflow-hidden rounded-[1.6rem] border border-primary/15 bg-[linear-gradient(135deg,hsl(var(--card)/0.9),hsl(var(--background)/0.82))] px-4 py-4 shadow-[0_20px_70px_hsl(var(--background)/0.4)] sm:px-5 sm:py-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_right_top,hsl(var(--primary)/0.16),transparent_42%)]" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">
              {recommendation.eyebrow}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground sm:text-base">
              {recommendation.title}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-6 text-muted-foreground sm:text-sm sm:leading-6">
              {recommendation.detail}
            </p>
          </div>
        </div>

        <Button onClick={recommendation.action} className="w-full shrink-0 gap-1.5 sm:w-auto">
          {recommendation.cta}
          <ArrowRight size={14} />
        </Button>
      </div>
    </section>
  );
}