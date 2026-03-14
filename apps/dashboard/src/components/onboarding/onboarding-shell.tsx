'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Globe,
  Layers3,
  PlayCircle,
  Radar,
  Rocket,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { CinematicOnboarding } from './cinematic-onboarding';

type Step = 'mission' | 'scan' | 'snapshot' | 'connections' | 'launch';
type PrimaryGoal = (typeof GOAL_OPTIONS)[number]['value'];
type PrimaryChannel = (typeof CHANNEL_OPTIONS)[number]['value'];

interface OnboardingFormState {
  websiteUrl: string;
  primaryGoal: PrimaryGoal;
  primaryChannel: PrimaryChannel;
}

interface ScanCheckItem {
  category: string;
  label: string;
  status: 'detected' | 'missing' | 'partial' | 'recommended';
  detail: string;
  platform?: string;
  confidence?: number;
}

interface ScanResult {
  domain: string;
  scannedUrl: string;
  scannedAt: string;
  readinessScore: number;
  detectedTech: Array<{ platform: string; confidence: number; evidence: string }>;
  checklist: ScanCheckItem[];
  connectablePlatforms: string[];
  missingPlatforms: string[];
  recommendedAgents: string[];
  performance: { serverResponseMs: number; hasCompression: boolean };
  security: { hasHttps: boolean; redirectsToHttps: boolean; hasHsts: boolean };
  seo: {
    hasSitemap: boolean;
    hasStructuredData: boolean;
    hasMetaDescription: boolean;
    hasCanonical: boolean;
  };
}

const STEP_ORDER: Step[] = ['mission', 'scan', 'snapshot', 'connections', 'launch'];

const GOAL_OPTIONS = [
  { value: 'lead_generation', label: 'Improve lead generation' },
  { value: 'reduce_ad_waste', label: 'Reduce ad waste' },
  { value: 'increase_ai_visibility', label: 'Increase AI visibility' },
  { value: 'launch_faster', label: 'Launch campaigns faster' },
  { value: 'diagnose_issues', label: 'Diagnose what is broken' },
] as const;

const CHANNEL_OPTIONS = [
  { value: 'paid', label: 'Paid' },
  { value: 'seo', label: 'SEO' },
  { value: 'ai_search', label: 'AI search' },
  { value: 'full_funnel', label: 'Full-funnel' },
] as const;

const PLATFORM_COPY: Record<string, { benefit: string; effort: string }> = {
  google_analytics: { benefit: 'Unlocks attribution confidence and conversion quality checks.', effort: 'Instant' },
  google_ads: { benefit: 'Unlocks spend waste detection and bid recommendations.', effort: '2 min' },
  meta_ads: { benefit: 'Unlocks cross-channel performance and creative feedback loops.', effort: '2 min' },
  google_search_console: { benefit: 'Unlocks ranking visibility and SEO agent baselines.', effort: '2 min' },
  hubspot: { benefit: 'Unlocks lead-stage attribution and CRM handoff tracking.', effort: '3 min' },
  wordpress: { benefit: 'Unlocks content publishing and SEO remediation.', effort: '2 min' },
};

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function prettifyPlatform(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getOnboardingState(tenant: any): string {
  return tenant?.onboardingState ?? tenant?.onboarding_state ?? 'created';
}

function isOnboardingComplete(state: string): boolean {
  return ['active', 'completed', 'live'].includes(state);
}

function buildOpportunitySnapshot(result: ScanResult, primaryGoal: string) {
  const checklistByStatus = {
    missing: result.checklist.filter((item) => item.status === 'missing'),
    partial: result.checklist.filter((item) => item.status === 'partial'),
    recommended: result.checklist.filter((item) => item.status === 'recommended'),
  };

  const opportunities = [] as Array<{ title: string; detail: string; impact: string }>;

  if (result.connectablePlatforms.length > 0) {
    opportunities.push({
      title: `${result.connectablePlatforms.length} platform${result.connectablePlatforms.length > 1 ? 's' : ''} can be connected now`,
      detail: 'You already have detectable tools in place. Fast connections will unlock higher-confidence recommendations immediately.',
      impact: 'Fastest time-to-value',
    });
  }

  if (!result.seo.hasSitemap || !result.seo.hasStructuredData) {
    opportunities.push({
      title: 'SEO foundations can be tightened quickly',
      detail: 'A sitemap or structured data gap is limiting the SEO and AEO agents from producing stronger coverage recommendations.',
      impact: 'Higher crawlability and AI visibility',
    });
  }

  if (result.performance.serverResponseMs > 1200 || !result.performance.hasCompression) {
    opportunities.push({
      title: 'Performance improvements are available before traffic scales',
      detail: 'The scanner found response speed or compression gaps that will affect ad efficiency and landing-page conversion rate.',
      impact: 'Faster page experience',
    });
  }

  if (primaryGoal === 'increase_ai_visibility') {
    opportunities.unshift({
      title: 'AEO should be activated early',
      detail: 'Your setup has enough signal to start visibility tracking and entity optimization, even before every platform is connected.',
      impact: 'Earlier presence in AI answers',
    });
  }

  if (primaryGoal === 'reduce_ad_waste') {
    opportunities.unshift({
      title: 'Paid-channel waste detection is the fastest win',
      detail: 'Connect analytics and ad platforms first so the Ad Agent can identify low-ROAS spend before more budget is committed.',
      impact: 'Immediate efficiency gains',
    });
  }

  const risk = checklistByStatus.missing[0] ?? checklistByStatus.partial[0] ?? checklistByStatus.recommended[0];
  const readinessLabel = result.readinessScore >= 75 ? 'High readiness' : result.readinessScore >= 50 ? 'Medium readiness' : 'Setup-first readiness';

  let mission = 'Launch a scan-led setup path and connect your highest-value platforms.';
  if (primaryGoal === 'lead_generation') mission = 'Fix tracking quality, connect CRM, and establish a clean lead funnel baseline.';
  if (primaryGoal === 'reduce_ad_waste') mission = 'Connect paid channels first and review the first spend-waste audit.';
  if (primaryGoal === 'increase_ai_visibility') mission = 'Activate AI visibility tracking and prioritize entity coverage gaps.';
  if (primaryGoal === 'launch_faster') mission = 'Set up the stack, then move straight into the first creative and campaign mission.';
  if (primaryGoal === 'diagnose_issues') mission = 'Surface the top blocking risk and guide the workspace into a safe diagnostic mode.';

  return {
    readinessLabel,
    opportunities: opportunities.slice(0, 3),
    risk,
    mission,
  };
}

export function OnboardingShell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('mission');
  const [form, setForm] = useState<OnboardingFormState>({
    websiteUrl: '',
    primaryGoal: GOAL_OPTIONS[0].value,
    primaryChannel: CHANNEL_OPTIONS[3].value,
  });
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.getMe(),
    staleTime: 30_000,
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations', 'onboarding-shell'],
    queryFn: () => api.getIntegrations(),
    staleTime: 30_000,
  });

  const connectMutation = useMutation({
    mutationFn: (platform: string) => api.connectIntegration(platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'onboarding-shell'] });
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: (platform: string) => api.reconnectIntegration(platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'onboarding-shell'] });
    },
  });

  const onboardingState = getOnboardingState(tenant);
  const tenantWebsite = tenant?.website ?? tenant?.websiteUrl ?? '';

  useEffect(() => {
    if (!form.websiteUrl && tenantWebsite) {
      setForm((current) => ({ ...current, websiteUrl: tenantWebsite }));
    }
  }, [form.websiteUrl, tenantWebsite]);

  const snapshot = useMemo(() => {
    return scanResult ? buildOpportunitySnapshot(scanResult, form.primaryGoal) : null;
  }, [form.primaryGoal, scanResult]);

  const progress = STEP_ORDER.indexOf(step) + 1;

  async function handleAnalyze() {
    const websiteUrl = normalizeUrl(form.websiteUrl);
    if (!websiteUrl) return;

    setIsScanning(true);
    setScanError(null);
    setStep('scan');

    try {
      const result = await api.runPreflightScan(websiteUrl);
      setScanResult(result);
      setForm((current) => ({ ...current, websiteUrl }));
      setStep('snapshot');
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'The scan failed. Please try again.');
    } finally {
      setIsScanning(false);
    }
  }

  if (tenantLoading) {
    return <div className="rounded-[2rem] border border-border bg-card/60 p-8 text-sm text-muted-foreground">Loading onboarding workspace…</div>;
  }

  if (isOnboardingComplete(onboardingState)) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="rounded-[2rem] border-primary/15 bg-[linear-gradient(135deg,hsl(var(--card)/0.92),hsl(var(--background)/0.84))] p-8 sm:p-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">Workspace Live</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your command center is already active.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                Onboarding has already completed for this workspace. You can jump into the dashboard or revisit the scanner for a new diagnostic pass.
              </p>
            </div>
            <CheckCircle2 className="h-10 w-10 text-green-400" />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => router.push('/dashboard')} className="gap-1.5">
              Open dashboard
              <ArrowRight size={14} />
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/scanner')}>
              Open scanner
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (step === 'launch') {
    return <CinematicOnboarding websiteUrl={form.websiteUrl} onComplete={() => router.push('/dashboard')} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-primary/15 bg-[linear-gradient(145deg,hsl(var(--card)/0.94),hsl(var(--background)/0.86))] shadow-[0_24px_90px_hsl(var(--background)/0.35)]">
        <div className="border-b border-border/40 px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">NexusZero Onboarding</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Set up your command center without the usual SaaS drag.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                We will scan your setup, surface the fastest win, and move you into a live workspace without forcing every integration upfront.
              </p>
            </div>
            <div className="rounded-2xl border border-primary/15 bg-primary/8 px-4 py-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Step {progress} of {STEP_ORDER.length}</div>
              <div className="mt-1">Current state: {onboardingState.replace(/_/g, ' ')}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {STEP_ORDER.map((item, index) => {
              const isActive = item === step;
              const isDone = STEP_ORDER.indexOf(step) > index;
              return (
                <div
                  key={item}
                  className={cn(
                    'rounded-2xl border px-3 py-3 text-xs transition-colors',
                    isActive && 'border-primary/40 bg-primary/12 text-foreground',
                    isDone && 'border-green-500/20 bg-green-500/8 text-foreground',
                    !isActive && !isDone && 'border-border/50 bg-background/30 text-muted-foreground',
                  )}
                >
                  <div className="font-medium capitalize">{item}</div>
                  <div className="mt-1 text-[11px] opacity-80">
                    {item === 'mission' && 'Capture goals'}
                    {item === 'scan' && 'Run analysis'}
                    {item === 'snapshot' && 'See the fastest wins'}
                    {item === 'connections' && 'Choose setup path'}
                    {item === 'launch' && 'Provision workspace'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          {step === 'mission' && (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <div className="rounded-[1.6rem] border border-border/50 bg-background/35 p-5">
                  <div className="flex items-center gap-3 text-sm font-medium text-foreground">
                    <Radar className="h-4 w-4 text-primary" />
                    Diagnose before demanding setup.
                  </div>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Start with your site and your goal. NexusZero will detect your stack, recommend the right agent mix, and show what can be automated safely.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <TrustCard icon={ShieldCheck} title="Read-only scan" detail="No external changes are made during analysis." />
                  <TrustCard icon={Sparkles} title="Fast first value" detail="Top opportunities surface before full integration work." />
                  <TrustCard icon={Layers3} title="Goal-aware path" detail="The setup route adapts to the channel you care about most." />
                </div>
              </div>

              <Card className="rounded-[1.6rem] border-border/60 bg-background/45 p-5 sm:p-6">
                <h2 className="text-lg font-semibold">Welcome / Mission Capture</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Point us at the business outcome first. The rest of the setup can follow the scan.
                </p>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Website URL</label>
                    <input
                      type="url"
                      value={form.websiteUrl}
                      onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))}
                      placeholder="https://yourcompany.com"
                      className="w-full rounded-xl border border-border bg-background/70 px-3 py-3 text-sm outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">What should NexusZero improve first?</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {GOAL_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, primaryGoal: option.value }))}
                          className={cn(
                            'rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                            form.primaryGoal === option.value
                              ? 'border-primary/40 bg-primary/12 text-foreground'
                              : 'border-border bg-background/55 text-muted-foreground hover:bg-background/75',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Which channel matters most right now?</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CHANNEL_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, primaryChannel: option.value }))}
                          className={cn(
                            'rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                            form.primaryChannel === option.value
                              ? 'border-primary/40 bg-primary/12 text-foreground'
                              : 'border-border bg-background/55 text-muted-foreground hover:bg-background/75',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button onClick={handleAnalyze} disabled={!form.websiteUrl.trim() || isScanning} className="gap-1.5">
                    {isScanning ? 'Analyzing…' : 'Analyze my setup'}
                    <ArrowRight size={14} />
                  </Button>
                  <Button variant="outline" onClick={() => router.push('/dashboard')}>
                    Explore manually
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {step === 'scan' && (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="rounded-[1.6rem] border-border/60 bg-background/45 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                    <Zap className={cn('h-5 w-5', isScanning && 'animate-pulse')} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Website Scan</h2>
                    <p className="text-sm text-muted-foreground">We are analyzing {normalizeUrl(form.websiteUrl)} and mapping the fastest path to value.</p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-border/50 bg-background/35 p-4">
                  <div className="h-2 overflow-hidden rounded-full bg-secondary/60">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-primary via-green-400 to-primary" />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {['Analytics', 'Advertising', 'SEO', 'Performance', 'Security', 'CMS'].map((label) => (
                      <div key={label} className="rounded-xl border border-border/40 bg-background/55 px-3 py-3 text-sm text-muted-foreground">
                        <div className="font-medium text-foreground">{label}</div>
                        <div className="mt-1 text-xs">Checking live signals and stack fingerprints…</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="rounded-[1.6rem] border-border/60 bg-background/45 p-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/80">What happens next</h3>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <p>1. We detect what is already in place.</p>
                  <p>2. We calculate a readiness score and recommend the right agent mix.</p>
                  <p>3. We build a connection plan around the fastest unlocks, not a giant admin checklist.</p>
                </div>
                {scanError && (
                  <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                    {scanError}
                  </div>
                )}
                {scanError && (
                  <div className="mt-4 flex gap-3">
                    <Button onClick={handleAnalyze}>Retry scan</Button>
                    <Button variant="outline" onClick={() => setStep('mission')}>Back</Button>
                  </div>
                )}
              </Card>
            </div>
          )}

          {step === 'snapshot' && scanResult && snapshot && (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <Card className="rounded-[1.6rem] border-border/60 bg-background/45 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">Opportunity Snapshot</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{snapshot.readinessLabel}</h2>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {scanResult.domain} scored {scanResult.readinessScore}/100. The fastest path is to move from diagnostics into one focused mission rather than connecting everything at once.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-primary/15 bg-primary/10 px-4 py-3 text-center">
                      <div className="text-3xl font-bold text-primary">{scanResult.readinessScore}</div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-primary/80">Readiness</div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-border/50 bg-background/35 p-4">
                    <div className="text-sm font-medium text-foreground">Recommended first mission</div>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{snapshot.mission}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {scanResult.recommendedAgents.map((agent) => (
                        <Badge key={agent} variant="outline">{prettifyPlatform(agent)} Agent</Badge>
                      ))}
                    </div>
                  </div>
                </Card>

                <Card className="rounded-[1.6rem] border-border/60 bg-background/45 p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/80">Top Risk</h3>
                  {snapshot.risk ? (
                    <div className="mt-4 rounded-2xl border border-yellow-500/25 bg-yellow-500/8 p-4">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <AlertTriangle className="h-4 w-4 text-yellow-400" />
                        {snapshot.risk.label}
                      </div>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{snapshot.risk.detail}</p>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">No critical blocker surfaced in the initial scan.</p>
                  )}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <StatChip icon={Globe} label="Detected tech" value={String(scanResult.detectedTech.length)} />
                    <StatChip icon={PlayCircle} label="Connectable now" value={String(scanResult.connectablePlatforms.length)} />
                    <StatChip icon={Sparkles} label="Recommended agents" value={String(scanResult.recommendedAgents.length)} />
                    <StatChip icon={ShieldCheck} label="Security posture" value={scanResult.security.hasHttps ? 'Strong' : 'Needs setup'} />
                  </div>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {snapshot.opportunities.map((opportunity) => (
                  <Card key={opportunity.title} className="rounded-[1.4rem] border-border/60 bg-background/45 p-5">
                    <div className="text-sm font-semibold text-foreground">{opportunity.title}</div>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{opportunity.detail}</p>
                    <div className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-primary/75">{opportunity.impact}</div>
                  </Card>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => setStep('connections')} className="gap-1.5">
                  Set up my recommended path
                  <ArrowRight size={14} />
                </Button>
                <Button variant="outline" onClick={() => setStep('mission')}>Adjust inputs</Button>
                <Button variant="outline" onClick={() => router.push('/dashboard/scanner')}>Open deep scan</Button>
              </div>
            </div>
          )}

          {step === 'connections' && scanResult && (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <Card className="rounded-[1.6rem] border-border/60 bg-background/45 p-6">
                  <h2 className="text-xl font-semibold">Connection Plan</h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    This plan favors the platforms that unlock the most immediate insight and automation for your chosen goal.
                  </p>

                  <div className="mt-6 space-y-5">
                    <ConnectionSection
                      title="Recommended now"
                      description="These platforms appear to be detectable or especially high-value for your current goal."
                      platforms={scanResult.connectablePlatforms}
                      integrations={integrations ?? []}
                      onConnect={(platform) => connectMutation.mutate(platform)}
                      onReconnect={(platform) => reconnectMutation.mutate(platform)}
                      isPending={connectMutation.isPending || reconnectMutation.isPending}
                    />
                    <ConnectionSection
                      title="Recommended next"
                      description="These tools are not auto-detected, but they would deepen attribution and expand the agent surface area."
                      platforms={scanResult.missingPlatforms.slice(0, 4)}
                      integrations={integrations ?? []}
                      onConnect={(platform) => connectMutation.mutate(platform)}
                      onReconnect={(platform) => reconnectMutation.mutate(platform)}
                      isPending={connectMutation.isPending || reconnectMutation.isPending}
                    />
                  </div>
                </Card>

                <Card className="rounded-[1.6rem] border-border/60 bg-background/45 p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/80">Minimum viable setup</h3>
                  <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/8 p-4">
                    <div className="text-sm font-medium text-foreground">You do not need a perfect setup to continue.</div>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      NexusZero can move into guided setup as soon as the scan is complete. Connections can be added after activation without losing momentum.
                    </p>
                  </div>

                  <div className="mt-5 space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <ChevronRight className="mt-1 h-4 w-4 text-primary" />
                      <span>Paid-first teams: analytics + one ad platform is enough to begin.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ChevronRight className="mt-1 h-4 w-4 text-primary" />
                      <span>SEO/AEO-first teams: scan results alone can start the first visibility mission.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ChevronRight className="mt-1 h-4 w-4 text-primary" />
                      <span>Connections can be completed after the command center is live.</span>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col gap-3">
                    <Button onClick={() => setStep('launch')} className="gap-1.5">
                      Continue with guided setup
                      <ArrowRight size={14} />
                    </Button>
                    <Button variant="outline" onClick={() => setStep('launch')}>
                      Skip to limited automation
                    </Button>
                    <Button variant="ghost" onClick={() => setStep('snapshot')}>
                      Back to snapshot
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TrustCard({ icon: Icon, title, detail }: { icon: typeof ShieldCheck; title: string; detail: string }) {
  return (
    <Card className="rounded-[1.4rem] border-border/50 bg-background/40 p-5">
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-3 text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </Card>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: typeof Globe; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/35 px-4 py-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ConnectionSection({
  title,
  description,
  platforms,
  integrations,
  onConnect,
  onReconnect,
  isPending,
}: {
  title: string;
  description: string;
  platforms: string[];
  integrations: any[];
  onConnect: (platform: string) => void;
  onReconnect: (platform: string) => void;
  isPending: boolean;
}) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-3">
        {platforms.length > 0 ? platforms.map((platform) => {
          const copy = PLATFORM_COPY[platform] ?? {
            benefit: 'Unlocks more context and broader automation coverage for the workspace.',
            effort: 'Manual',
          };
          const existing = integrations.find((integration: any) => integration.platform === platform);
          const status = existing?.status ?? 'disconnected';
          const actionLabel = status === 'error' || status === 'degraded'
            ? 'Reconnect'
            : status === 'active' || status === 'pending'
            ? 'Queued'
            : 'Connect';
          const action = status === 'error' || status === 'degraded'
            ? () => onReconnect(platform)
            : () => onConnect(platform);

          return (
            <div key={platform} className="rounded-2xl border border-border/50 bg-background/35 px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-foreground">{prettifyPlatform(platform)}</div>
                    <Badge variant="outline">{copy.effort}</Badge>
                    {existing && <Badge variant={status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'outline'}>{status}</Badge>}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{copy.benefit}</p>
                </div>
                <Button
                  variant={status === 'active' || status === 'pending' ? 'outline' : 'primary'}
                  size="sm"
                  disabled={isPending || status === 'active' || status === 'pending'}
                  onClick={action}
                >
                  {isPending && (status !== 'active' && status !== 'pending') ? 'Queueing…' : actionLabel}
                </Button>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 px-4 py-5 text-sm text-muted-foreground">
            No additional platforms surfaced for this section.
          </div>
        )}
      </div>
    </div>
  );
}