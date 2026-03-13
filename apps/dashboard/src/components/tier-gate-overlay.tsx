'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Lock, ArrowUpRight, Sparkles } from 'lucide-react';

interface TierGateProps {
  /** Feature name shown to the user */
  feature: string;
  /** Description of what this feature does */
  description: string;
  /** Minimum tier needed (growth or enterprise) */
  requiredTier: 'growth' | 'enterprise';
  /** The gated page content rendered blurred underneath */
  children: React.ReactNode;
}

const TIER_LABELS: Record<string, string> = {
  launchpad: 'Launchpad',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

const TIER_PRICES: Record<string, string> = {
  growth: '$799/mo',
  enterprise: 'Custom',
};

/**
 * Wraps page content with a blurred overlay when the user's tier is too low.
 * Shows the actual content blurred underneath so users can "preview" the feature.
 */
export function TierGateOverlay({ feature, description, requiredTier, children }: TierGateProps) {
  const { data: me } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.getMe(),
    staleTime: 60_000,
  });

  const currentTier = me?.plan ?? 'launchpad';
  const tierOrder = ['launchpad', 'growth', 'enterprise'];
  const hasAccess = tierOrder.indexOf(currentTier) >= tierOrder.indexOf(requiredTier);

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content preview */}
      <div className="pointer-events-none select-none" style={{ filter: 'blur(6px)', opacity: 0.45 }}>
        {children}
      </div>

      {/* Overlay card */}
      <div className="absolute inset-0 flex items-start justify-center pt-24 z-20">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-8 shadow-2xl shadow-black/30 text-center space-y-5 animate-fade-in">
          {/* Icon */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 flex items-center justify-center">
            <Lock size={24} className="text-primary" />
          </div>

          {/* Title */}
          <div>
            <h2 className="text-lg font-bold">{feature}</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
          </div>

          {/* Tier badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <Sparkles size={12} />
            Available on {TIER_LABELS[requiredTier]} ({TIER_PRICES[requiredTier]})
          </div>

          {/* What you'd unlock */}
          <div className="text-left rounded-xl bg-secondary/40 p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground">What you&apos;d unlock:</p>
            {requiredTier === 'growth' && (
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><Check /> Creative Engine — AI-generated ad creatives</li>
                <li className="flex items-center gap-2"><Check /> AEO tracking across 6 AI platforms</li>
                <li className="flex items-center gap-2"><Check /> Advanced analytics & funnel experiments</li>
                <li className="flex items-center gap-2"><Check /> Multi-touch attribution models</li>
                <li className="flex items-center gap-2"><Check /> Up to 50 campaigns & 2,000 creatives/mo</li>
              </ul>
            )}
            {requiredTier === 'enterprise' && (
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><Check /> Everything in Growth</li>
                <li className="flex items-center gap-2"><Check /> White-label platform</li>
                <li className="flex items-center gap-2"><Check /> Custom model training</li>
                <li className="flex items-center gap-2"><Check /> Unlimited campaigns & creatives</li>
                <li className="flex items-center gap-2"><Check /> Dedicated SLA & API access</li>
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <a
              href="/dashboard/settings"
              className="flex-1 rounded-xl bg-secondary hover:bg-secondary/80 px-4 py-2.5 text-xs font-medium text-foreground transition-colors text-center"
            >
              See Plans
            </a>
            <a
              href="/dashboard/settings?upgrade=true"
              className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors text-center flex items-center justify-center gap-1.5"
            >
              Upgrade <ArrowUpRight size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400 shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
