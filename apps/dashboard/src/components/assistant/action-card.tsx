'use client';

import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

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
export function ActionCard({ tool, args, result }: ActionCardProps) {
  const label = TOOL_LABELS[tool] ?? tool;
  const detail = getDetailString(tool, args);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/25 bg-secondary/25 px-3 py-2 my-1 text-xs msg-enter">
      <CheckCircle className="w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
      <span className="text-foreground/80 font-medium">{label}</span>
      {detail && <span className="text-muted-foreground/60 truncate">{detail}</span>}
      <ArrowRight className="w-3 h-3 text-muted-foreground/40 ml-auto shrink-0" />
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
