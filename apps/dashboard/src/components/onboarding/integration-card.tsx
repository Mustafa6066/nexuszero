'use client';

import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { CheckCircle2, ExternalLink, HelpCircle, Loader2, Plug, RefreshCw } from 'lucide-react';

export type ConnectionStatus = 'disconnected' | 'active' | 'pending' | 'error' | 'degraded';

interface IntegrationCardProps {
  platform: string;
  benefit: string;
  effort: string;
  status: ConnectionStatus;
  isOptional?: boolean;
  priorityRank?: number;
  whyConnect?: string;
  onConnect: () => void;
  onReconnect: () => void;
  isPending: boolean;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; variant: 'success' | 'warning' | 'outline' | 'destructive'; icon: typeof CheckCircle2 }> = {
  active: { label: 'Connected', variant: 'success', icon: CheckCircle2 },
  pending: { label: 'Pending', variant: 'warning', icon: Loader2 },
  error: { label: 'Error', variant: 'destructive', icon: RefreshCw },
  degraded: { label: 'Degraded', variant: 'warning', icon: RefreshCw },
  disconnected: { label: 'Not connected', variant: 'outline', icon: Plug },
};

function prettifyPlatform(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function IntegrationCard({
  platform,
  benefit,
  effort,
  status,
  isOptional = false,
  priorityRank,
  whyConnect,
  onConnect,
  onReconnect,
  isPending,
}: IntegrationCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  const isConnected = status === 'active' || status === 'pending';
  const needsReconnect = status === 'error' || status === 'degraded';

  const actionLabel = needsReconnect ? 'Reconnect' : isConnected ? 'Connected' : 'Connect';
  const action = needsReconnect ? onReconnect : onConnect;

  return (
    <div
      className={cn(
        'group relative rounded-2xl border px-4 py-4 transition-all duration-200',
        isConnected
          ? 'border-green-500/20 bg-green-500/5'
          : needsReconnect
          ? 'border-red-500/20 bg-red-500/5'
          : 'border-border/50 bg-background/35 hover:border-border/80 hover:bg-background/50',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusIcon
              size={14}
              className={cn(
                isConnected ? 'text-green-400' : needsReconnect ? 'text-red-400' : 'text-muted-foreground',
                status === 'pending' && 'animate-spin',
              )}
            />
            <span className="text-sm font-semibold text-foreground">{prettifyPlatform(platform)}</span>
            {priorityRank && priorityRank <= 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                #{priorityRank} priority
              </Badge>
            )}
            {isOptional && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Optional
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {effort}
            </Badge>
            <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
              {config.label}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{benefit}</p>

          {/* "Why connect this?" tooltip */}
          {whyConnect && !isConnected && (
            <div className="relative inline-block mt-1.5">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip((prev) => !prev)}
              >
                <HelpCircle size={12} />
                <span>Why connect this?</span>
              </button>
              {showTooltip && (
                <div className="absolute left-0 top-full mt-1.5 z-10 w-64 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground shadow-lg animate-fade-in">
                  {whyConnect}
                </div>
              )}
            </div>
          )}
        </div>

        <Button
          variant={isConnected ? 'outline' : needsReconnect ? 'destructive' : 'primary'}
          size="sm"
          disabled={isPending || isConnected}
          onClick={action}
          className="shrink-0 gap-1.5"
        >
          {isPending && !isConnected ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Connecting…
            </>
          ) : (
            <>
              {needsReconnect && <RefreshCw size={12} />}
              {!isConnected && !needsReconnect && <ExternalLink size={12} />}
              {actionLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
