'use client';

import { CheckCircle, ArrowRight } from 'lucide-react';

interface ActionCardProps {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}

const TOOL_LABELS: Record<string, string> = {
  navigate: 'Navigated to page',
  setDateRange: 'Set date range',
  setFilter: 'Applied filter',
  createCampaign: 'Created campaign',
  generateCreative: 'Generated creative',
  pauseCampaign: 'Paused campaign',
  resumeCampaign: 'Resumed campaign',
  adjustBudget: 'Adjusted budget',
  triggerSeoAudit: 'Triggered SEO audit',
  triggerAeoScan: 'Triggered AEO scan',
  generateReport: 'Generated report',
  connectIntegration: 'Connecting integration',
  reconnectIntegration: 'Reconnecting integration',
};

/** Card showing an action the assistant took */
export function ActionCard({ tool, args }: ActionCardProps) {
  const label = TOOL_LABELS[tool] ?? tool;
  const detail = getDetailString(tool, args);

  return (
    <div className="my-1 rounded-2xl border border-primary/10 bg-background/35 px-3 py-2.5 text-xs msg-enter shadow-[0_10px_24px_hsl(var(--background)/0.14)]">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400/75" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">Operation</span>
        <ArrowRight className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/40" />
      </div>
      <div className="mt-1.5 text-sm font-medium text-foreground/85">{label}</div>
      {detail && <div className="mt-1 truncate text-xs text-muted-foreground/65">{detail}</div>}
    </div>
  );
}

function getDetailString(tool: string, args: Record<string, unknown>): string | null {
  switch (tool) {
    case 'navigate': return args.page as string;
    case 'setDateRange': return `${args.start} to ${args.end}`;
    case 'setFilter': return `${args.key} = ${args.value}`;
    case 'createCampaign': return args.name as string;
    case 'pauseCampaign':
    case 'resumeCampaign': return args.campaignId as string;
    case 'adjustBudget': return `$${args.newDailyBudget}/day`;
    case 'connectIntegration': return args.platform as string;
    case 'generateReport': return args.type as string;
    default: return null;
  }
}
