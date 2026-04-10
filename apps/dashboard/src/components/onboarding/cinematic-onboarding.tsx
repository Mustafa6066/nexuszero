'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws-client';
import { ArrowRight, Check, Loader2, Plug, Search, Rocket, AlertCircle, RefreshCw, Target, ChevronLeft } from 'lucide-react';
import { useLang } from '@/app/providers';

/* ─── First Mission routing by goal ─── */
const FIRST_MISSIONS: Record<string, { title: string; description: string; route: string; cta: string }> = {
  lead_generation: {
    title: 'Review your attribution baseline',
    description: 'Your analytics setup is live. Open the attribution dashboard to see where leads originate and where signal gaps exist.',
    route: '/dashboard/analytics',
    cta: 'Open Attribution Dashboard',
  },
  reduce_ad_waste: {
    title: 'Approve the top ad waste reductions',
    description: 'The Ad Agent has identified initial spend inefficiencies. Review the approval queue to accept or override the first recommendations.',
    route: '/dashboard/approvals',
    cta: 'Review Approval Queue',
  },
  increase_ai_visibility: {
    title: 'Review your AI visibility gaps',
    description: 'The AEO Agent has started tracking your brand across ChatGPT, Perplexity, and Gemini. See where you appear and where you are missing.',
    route: '/dashboard/aeo',
    cta: 'View AI Visibility',
  },
  launch_faster: {
    title: 'Review your first creative pack',
    description: 'The Creative Engine has generated initial ad variants based on your brand and goals. Review, edit, and approve before launch.',
    route: '/dashboard/creatives',
    cta: 'Open Creative Engine',
  },
  diagnose_issues: {
    title: 'Review your diagnostic report',
    description: 'The scanner has mapped your stack, identified risks, and scored your readiness. Dig into the full report to prioritize fixes.',
    route: '/dashboard/scanner',
    cta: 'Open Diagnostic Report',
  },
};

/* ─── Visual step mapping ─── */
type VisualStep = 'connecting' | 'analyzing' | 'launching';

interface StepConfig {
  label: string;
  description: string;
  icon: typeof Plug;
  substeps: string[];
}

const VISUAL_STEPS: Record<VisualStep, StepConfig> = {
  connecting: {
    label: 'Connecting',
    description: 'Detecting your tech stack and setting up platform connections',
    icon: Plug,
    substeps: ['Scanning website...', 'Detecting platforms...', 'Establishing connections...'],
  },
  analyzing: {
    label: 'Analyzing',
    description: 'Your AI agents are auditing your marketing setup',
    icon: Search,
    substeps: [
      'SEO Agent analyzing keywords...',
      'Ad Agent scanning campaign structure...',
      'Data Nexus running quality checks...',
      'Generating marketing strategy...',
      'Provisioning your workspace...',
    ],
  },
  launching: {
    label: 'Launching',
    description: 'Activating your agent swarm and going live',
    icon: Rocket,
    substeps: ['Activating agents...', 'Creating demo campaign...', 'Setting up webhooks...', 'Final checks...'],
  },
};

const STEP_ORDER: VisualStep[] = ['connecting', 'analyzing', 'launching'];

/** Maps the 12-state backend state to our 3 visual steps */
function mapBackendState(state: string): { step: VisualStep; substepIndex: number } {
  switch (state) {
    case 'created':
    case 'oauth_connecting':
      return { step: 'connecting', substepIndex: 0 };
    case 'oauth_connected':
      return { step: 'connecting', substepIndex: 2 };
    case 'auditing':
      return { step: 'analyzing', substepIndex: 0 };
    case 'audit_complete':
      return { step: 'analyzing', substepIndex: 3 };
    case 'provisioning':
    case 'provisioned':
      return { step: 'analyzing', substepIndex: 4 };
    case 'strategy_generating':
      return { step: 'analyzing', substepIndex: 3 };
    case 'strategy_ready':
      return { step: 'analyzing', substepIndex: 4 };
    case 'going_live':
      return { step: 'launching', substepIndex: 0 };
    case 'active':
      return { step: 'launching', substepIndex: 3 };
    default:
      return { step: 'connecting', substepIndex: 0 };
  }
}

interface ActivityItem {
  id: string;
  text: string;
  status: 'done' | 'running' | 'pending';
  timestamp: number;
}

export function CinematicOnboarding({ websiteUrl, primaryGoal, primaryChannel, onComplete }: { websiteUrl: string; primaryGoal?: string; primaryChannel?: string; onComplete?: () => void }) {
  const { t } = useLang();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<VisualStep>('connecting');
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [discoveries, setDiscoveries] = useState<{ label: string; value: string; icon: string }[]>([]);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [dynamicMission, setDynamicMission] = useState<{ title: string; description: string; agentType?: string; estimatedImpact?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityFeedRef = useRef<HTMLDivElement>(null);

  const addActivity = useCallback((text: string, status: ActivityItem['status'] = 'done') => {
    setActivities((prev) => {
      // Move any 'running' items to 'done'
      const updated = prev.map((a) => (a.status === 'running' ? { ...a, status: 'done' as const } : a));
      return [...updated, { id: `${Date.now()}-${Math.random()}`, text, status, timestamp: Date.now() }];
    });
  }, []);

  const addDiscovery = useCallback((label: string, value: string, icon: string) => {
    setDiscoveries((prev) => {
      if (prev.some((d) => d.label === label)) return prev;
      return [...prev, { label, value, icon }];
    });
  }, []);

  // Start onboarding and listen for real-time progress via WebSocket
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        addActivity('Starting onboarding...', 'running');
        await api.startOnboarding(websiteUrl);
        addActivity('Onboarding initiated');
        addActivity('Scanning your website...', 'running');

        // Subscribe to real-time onboarding progress via WebSocket
        const unsubWs = wsClient.subscribe('onboarding:progress', (event, data) => {
          if (cancelled) return;
          const payload = data as {
            previousState?: string;
            newState?: string;
            progress?: { percentComplete?: number; currentStep?: number };
            businessType?: string;
            emailPlatforms?: string[];
            paymentProcessors?: string[];
            socialProfiles?: Array<{ platform: string; url: string }>;
          };

          if (event === 'state_changed' && payload.newState) {
            const mapped = mapBackendState(payload.newState);
            setCurrentStep(mapped.step);
            addActivity(`${payload.previousState ?? '?'} → ${payload.newState}`, 'running');

            if (payload.newState === 'active') {
              setIsComplete(true);
              setShowConfetti(true);
              setShowSuccessScreen(true);
              setTimeout(() => setShowConfetti(false), 4000);
              addActivity('All systems operational — Welcome to NexusZero.');

              // Fetch the LLM-generated strategy for dynamic first mission
              api.getStrategy().then((strategy) => {
                if (strategy?.firstMission) {
                  setDynamicMission(strategy.firstMission);
                }
              }).catch(() => { /* strategy may not be ready yet, fall back to static */ });
            }
          }

          // Handle discovery updates with business classification
          if (event === 'discovery_update') {
            if (payload.businessType) {
              setBusinessType(payload.businessType);
              const typeLabel = payload.businessType.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              addDiscovery('Business Type', typeLabel, '🏢');
              addActivity(`Classified as ${typeLabel}`);
            }
            if (payload.emailPlatforms?.length) {
              addDiscovery('Email', payload.emailPlatforms.join(', '), '📧');
              addActivity(`Detected email: ${payload.emailPlatforms.join(', ')}`);
            }
            if (payload.paymentProcessors?.length) {
              addDiscovery('Payments', payload.paymentProcessors.join(', '), '💳');
              addActivity(`Detected payments: ${payload.paymentProcessors.join(', ')}`);
            }
            if (payload.socialProfiles?.length) {
              addDiscovery('Social', `${payload.socialProfiles.length} profiles`, '🔗');
              addActivity(`Found ${payload.socialProfiles.length} social profile(s)`);
            }
          }
        });

        // Keep polling as fallback for when WS is not connected
        pollRef.current = setInterval(async () => {
          try {
            const me = await api.getMe();
            if (me?.onboardingState === 'active') {
              if (!cancelled) {
                setIsComplete(true);
                setShowSuccessScreen(true);
                if (pollRef.current) clearInterval(pollRef.current);
              }
            } else if (me?.onboardingState) {
              // Update visual step from polling when WS is unavailable
              const mapped = mapBackendState(me.onboardingState);
              setCurrentStep(mapped.step);
            }
          } catch {
            // Silently retry
          }
        }, 5000);

        // Cleanup WS subscription on unmount
        return () => {
          unsubWs();
        };
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Onboarding failed');
          addActivity('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [websiteUrl, addActivity]);

  // Auto-scroll activity feed
  useEffect(() => {
    if (activityFeedRef.current) {
      activityFeedRef.current.scrollTop = activityFeedRef.current.scrollHeight;
    }
  }, [activities]);

  function handleContinue() {
    onComplete?.();
    if (dynamicMission) {
      // Route to strategy page when LLM-generated strategy is available
      router.push('/dashboard/strategy');
    } else {
      const mission = FIRST_MISSIONS[primaryGoal ?? ''];
      router.push(mission?.route ?? '/dashboard');
    }
  }

  function handleRetry() {
    setError(null);
    setActivities([]);
    setCurrentStep('connecting');
    window.location.reload();
  }

  const stepIndex = STEP_ORDER.indexOf(currentStep);
  const progressPct = isComplete ? 100 : Math.round(((stepIndex + 0.5) / STEP_ORDER.length) * 100);
  const estimatedSeconds = isComplete ? 0 : Math.max(0, (STEP_ORDER.length - stepIndex - 1) * 30 + 15);

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 aurora-bg pointer-events-none" />

      {/* Confetti burst */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                left: `${50 + (Math.random() - 0.5) * 80}%`,
                top: '-5%',
                backgroundColor: ['#818cf8', '#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'][i % 6],
                animation: `confettiFall ${2 + Math.random() * 2}s ease-in forwards`,
                animationDelay: `${Math.random() * 0.5}s`,
              }}
            />
          ))}
          <style>{`
            @keyframes confettiFall {
              0% { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(100vh) rotate(${360 + Math.random() * 360}deg); opacity: 0; }
            }
          `}</style>
        </div>
      )}

      <div className="w-full max-w-2xl space-y-8 animate-fade-in relative z-10">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-2">NexusZero</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {isComplete ? 'Your Command Center is Live' : 'Setting Up Your Marketing AI'}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {isComplete
              ? 'Your AI agents are deployed and ready for operation.'
              : `Step ${stepIndex + 1} of ${STEP_ORDER.length} — ~${Math.ceil(estimatedSeconds / 60)}m remaining`}
          </p>
        </div>

        {/* Progress bar */}
        <div className="relative">
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-green-500 transition-all duration-1000 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-3">
            {STEP_ORDER.map((step, i) => {
              const config = VISUAL_STEPS[step];
              const Icon = config.icon;
              const isDone = i < stepIndex || isComplete;
              const isActive = i === stepIndex && !isComplete;
              return (
                <div key={step} className="flex flex-col items-center gap-1.5 flex-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isDone
                        ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30'
                        : isActive
                        ? 'bg-primary/20 text-primary ring-2 ring-primary/40 animate-pulse'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {isDone ? <Check size={16} /> : isActive ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                  </div>
                  <span className={`text-xs font-medium ${isDone ? 'text-green-400' : isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {config.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Discovery cards */}
        {discoveries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {discoveries.map((d, i) => (
              <div
                key={d.label}
                className="rounded-xl border border-border bg-card/60 p-3 flex items-center gap-3 animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="text-lg">{d.icon}</span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.label}</p>
                  <p className="text-sm font-semibold truncate">{d.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Business type strategy implications */}
        {businessType && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">Strategy tailored for {businessType.replace(/-/g, ' ')}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {businessType === 'e-commerce' && 'Your strategy will prioritize product feed optimization, shopping ad performance, and conversion funnel analysis.'}
              {businessType === 'saas' && 'Your strategy will focus on lead generation funnels, content-driven SEO, and trial-to-paid conversion tracking.'}
              {businessType === 'agency' && 'Your strategy will emphasize portfolio visibility, case study SEO, and multi-client campaign management.'}
              {businessType === 'local-business' && 'Your strategy will prioritize local SEO, Google Business Profile optimization, and location-based visibility.'}
              {businessType === 'media' && 'Your strategy will focus on content distribution, audience growth, and engagement-driven monetization.'}
              {businessType === 'non-profit' && 'Your strategy will emphasize donor acquisition, cause awareness campaigns, and community engagement.'}
              {businessType === 'marketplace' && 'Your strategy will balance seller acquisition, buyer experience, and cross-side network effects.'}
              {businessType === 'other' && 'Your strategy will be customized based on your specific goals and connected platforms.'}
            </p>
          </div>
        )}

        {/* Activity feed */}
        <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {!isComplete && !error && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${isComplete ? 'bg-green-400' : error ? 'bg-red-400' : 'bg-green-400'}`} />
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {isComplete ? 'Setup Complete' : error ? 'Error Occurred' : 'Live Activity'}
            </span>
          </div>
          <div ref={activityFeedRef} className="max-h-64 overflow-y-auto p-4 space-y-2.5">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 animate-fade-in">
                <div className="mt-0.5 shrink-0">
                  {activity.status === 'done' ? (
                    <Check size={14} className="text-green-400" />
                  ) : activity.status === 'running' ? (
                    <Loader2 size={14} className="text-primary animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${activity.status === 'running' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {activity.text}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground/50 shrink-0 tabular-nums">
                  {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Error / Complete actions */}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">Setup encountered an issue</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
              <p className="text-xs text-muted-foreground mt-1">Your previous progress is saved — you can retry or go back to the previous step.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => {
                  try {
                    await api.stepBackOnboarding();
                    setError(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
                className="rounded-lg bg-secondary hover:bg-secondary/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors flex items-center gap-1.5"
              >
                <ChevronLeft size={12} /> Go Back
              </button>
              <button
                onClick={handleRetry}
                className="rounded-lg bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          </div>
        )}

        {isComplete && showSuccessScreen && (() => {
          const staticMission = FIRST_MISSIONS[primaryGoal ?? ''];
          const mission = dynamicMission
            ? { title: dynamicMission.title, description: dynamicMission.description, route: '/dashboard/strategy', cta: 'View Your Strategy' }
            : staticMission;
          return (
            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-8 space-y-5 animate-fade-in">
              <div className="flex items-center justify-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center ring-4 ring-green-500/10">
                  <Check size={32} className="text-green-400" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold">{t.onboardingMission?.commandCenterLive || 'Your Command Center is Live'}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {typeof t.onboardingMission?.insightsFound === 'function' ? t.onboardingMission.insightsFound(discoveries.length) : `Your AI agents found ${discoveries.length} key insights during setup.`}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {discoveries.map((d) => (
                  <span key={d.label} className="inline-flex items-center gap-1 rounded-full bg-card/80 border border-border px-3 py-1 text-xs">
                    <span>{d.icon}</span> {d.label}: <span className="font-semibold">{d.value}</span>
                  </span>
                ))}
              </div>

              {/* First Mission card */}
              {mission && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-start">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                    <Target size={12} /> {t.onboardingMission?.firstMission || 'Your First Mission'}
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-foreground">{mission.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{mission.description}</p>
                </div>
              )}

              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={handleContinue}
                  className="btn-glow inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-green-600 px-8 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {mission?.cta ?? 'Open Command Center'}
                  <ArrowRight size={16} />
                </button>
                {mission && (
                  <button
                    onClick={() => { onComplete?.(); router.push('/dashboard'); }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t.onboardingMission?.openDashboard || 'Open full dashboard instead'}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
