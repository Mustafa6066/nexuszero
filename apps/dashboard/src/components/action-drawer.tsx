'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui';
import { useLang } from '@/app/providers';
import { X, ChevronRight, Brain, Zap, AlertTriangle, BarChart3, PenLine, RotateCcw } from 'lucide-react';

const CATEGORY_CONFIG: Record<string, { icon: typeof Brain; color: string; label: string }> = {
  analysis: { icon: BarChart3, color: 'text-blue-400', label: 'Analysis' },
  optimization: { icon: Zap, color: 'text-green-400', label: 'Optimization' },
  creation: { icon: PenLine, color: 'text-purple-400', label: 'Creation' },
  modification: { icon: PenLine, color: 'text-cyan-400', label: 'Modification' },
  alert: { icon: AlertTriangle, color: 'text-yellow-400', label: 'Alert' },
  rollback: { icon: RotateCcw, color: 'text-red-400', label: 'Rollback' },
};

interface ActionDrawerProps {
  agentId: string;
  agentLabel: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ActionDrawer({ agentId, agentLabel, isOpen, onClose }: ActionDrawerProps) {
  const { t } = useLang();
  const [selectedAction, setSelectedAction] = useState<any>(null);

  const { data: actions, isLoading } = useQuery({
    queryKey: ['agent-actions', agentId],
    queryFn: () => api.getAgentActions(agentId, { limit: 50 }),
    enabled: isOpen,
    refetchInterval: 15_000,
  });

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 ltr:right-0 rtl:left-0 z-50 w-full max-w-md bg-card border-s border-border shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">{agentLabel} — {t.actions?.title || 'Action Log'}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-secondary transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedAction ? (
            <ActionDetail action={selectedAction} onBack={() => setSelectedAction(null)} />
          ) : (
            <div className="divide-y divide-border">
              {isLoading ? (
                <div className="p-6 text-center">
                  <div className="animate-pulse space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 rounded-lg bg-secondary/50" />
                    ))}
                  </div>
                </div>
              ) : (actions ?? []).length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">{t.actions?.empty || 'No actions recorded yet'}</p>
                </div>
              ) : (
                (actions ?? []).map((action: any) => {
                  const cat = CATEGORY_CONFIG[action.category] || CATEGORY_CONFIG.analysis;
                  const Icon = cat.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => setSelectedAction(action)}
                      className="w-full flex items-start gap-3 p-3 hover:bg-secondary/30 transition-colors text-start"
                    >
                      <div className={`mt-0.5 shrink-0 ${cat.color}`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate">
                            {action.actionType?.replace(/_/g, ' ')}
                          </span>
                          <Badge variant={action.category === 'alert' ? 'warning' : action.category === 'rollback' ? 'destructive' : 'outline'}>
                            {cat.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {action.reasoning}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {action.confidence != null && (
                            <span className="text-[10px] text-muted-foreground/70">
                              {t.actions?.confidence || 'Confidence'}: {(action.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                          {action.impactDelta != null && action.impactMetric && (
                            <span className="text-[10px] text-muted-foreground/70">
                              {action.impactMetric}: {action.impactDelta > 0 ? '+' : ''}{typeof action.impactDelta === 'number' ? action.impactDelta.toFixed(1) : action.impactDelta}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/50">
                            {new Date(action.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground/50 mt-1 shrink-0 rtl:rotate-180" />
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ActionDetail({ action, onBack }: { action: any; onBack: () => void }) {
  const cat = CATEGORY_CONFIG[action.category] || CATEGORY_CONFIG.analysis;
  const Icon = cat.icon;

  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="text-xs text-primary hover:underline">← Back to list</button>

      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 bg-secondary/50 ${cat.color}`}>
          <Icon size={20} />
        </div>
        <div>
          <h3 className="text-sm font-bold">{action.actionType?.replace(/_/g, ' ')}</h3>
          <Badge variant={action.category === 'alert' ? 'warning' : 'outline'}>{cat.label}</Badge>
        </div>
      </div>

      {/* Reasoning */}
      <div className="rounded-xl bg-secondary/30 p-3">
        <p className="text-xs font-semibold text-muted-foreground mb-1">Why this action was taken</p>
        <p className="text-sm leading-relaxed">{action.reasoning}</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        {action.confidence != null && (
          <div className="rounded-xl bg-secondary/20 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</p>
            <p className="text-lg font-bold mt-0.5">{(action.confidence * 100).toFixed(0)}%</p>
            <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${action.confidence * 100}%` }} />
            </div>
          </div>
        )}
        {action.impactDelta != null && (
          <div className="rounded-xl bg-secondary/20 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{action.impactMetric || 'Impact'}</p>
            <p className={`text-lg font-bold mt-0.5 ${action.impactDelta > 0 ? 'text-green-400' : action.impactDelta < 0 ? 'text-red-400' : ''}`}>
              {action.impactDelta > 0 ? '+' : ''}{action.impactDelta.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Before / After states */}
      {(action.beforeState || action.afterState) && (
        <div className="space-y-2">
          {action.beforeState && (
            <div className="rounded-xl bg-red-500/5 border border-red-500/10 p-3">
              <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-1">Before</p>
              <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(action.beforeState, null, 2)}
              </pre>
            </div>
          )}
          {action.afterState && (
            <div className="rounded-xl bg-green-500/5 border border-green-500/10 p-3">
              <p className="text-[10px] text-green-400 font-semibold uppercase tracking-wider mb-1">After</p>
              <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(action.afterState, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Trigger */}
      {action.trigger && (
        <div className="rounded-xl bg-secondary/20 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Trigger</p>
          <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(action.trigger, null, 2)}
          </pre>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/50">
        {new Date(action.createdAt).toLocaleString()} · ID: {action.id}
      </p>
    </div>
  );
}
