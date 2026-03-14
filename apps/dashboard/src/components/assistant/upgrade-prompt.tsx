'use client';

import { ArrowUpRight } from 'lucide-react';

interface UpgradePromptProps {
  feature: string;
  requiredTier: string;
  description?: string;
}

/** Inline upgrade CTA shown when a feature is tier-gated */
export function UpgradePrompt({ feature, requiredTier, description }: UpgradePromptProps) {
  return (
    <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 my-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground/90">
            Upgrade to unlock {feature}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {description ?? `This feature is available on the ${requiredTier} plan and above.`}
          </p>
        </div>
        <a
          href="/dashboard/settings?tab=billing"
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg
            bg-primary/90 text-primary-foreground hover:bg-primary transition-all duration-200"
        >
          Upgrade <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
