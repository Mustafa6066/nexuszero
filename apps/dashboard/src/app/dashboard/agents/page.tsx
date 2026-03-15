'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';
import { BarChartWidget } from '@/components/charts';
import { ActionDrawer } from '@/components/action-drawer';
import { useAssistantActions } from '@/hooks/use-assistant';
import { ChevronDown, ChevronUp, Flame, Bot, Check, X, Clock, Loader2, Brain, ShieldOff } from 'lucide-react';
import { WorkspaceGuidanceBanner } from '@/components/workspace-guidance-banner';
import { useLang } from '@/app/providers';

const AGENT_TYPES = ['seo', 'ad', 'data_nexus', 'aeo', 'creative'] as const;

const AGENT_COLORS: Record<string, string> = {
  seo: '#8b5cf6',
  ad: '#06b6d4',
  data_nexus: '#10b981',
  aeo: '#f59e0b',
  creative: '#ec4899',
};

const AGENT_LABELS: Record<string, string> = {
  seo: 'SEO Agent',
  ad: 'Ad Agent',
  data_nexus: 'Data Nexus',
  aeo: 'AEO Agent',
  creative: 'Creative Engine',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
  active: 'success',
  idle: 'outline',
  processing: 'warning',
  error: 'destructive',
  paused: 'warning',
};

function AgentPulse({ status }: { status: string }) {
  const color = status === 'processing' ? 'bg-yellow-400' : status === 'active' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-muted-foreground';
  return (
    <span className="relative flex h-2.5 w-2.5">
      {(status === 'active' || status === 'processing') && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}

/** Streak badge based on consecutive error-free days */
function StreakBadge({ completed, failed }: { completed: number; failed: number }) {
  if (completed < 10) return null;
  const ratio = completed / Math.max(completed + failed, 1);
  if (ratio < 0.9) return null;
  const level = completed >= 500 ? 'gold' : completed >= 100 ? 'silver' : 'bronze';
  const colors = { bronze: 'text-orange-400', silver: 'text-slate-300', gold: 'text-amber-400' };
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${colors[level]}`} title={`${completed} tasks without issues`}>
      <Flame size={12} /> {level}
    </span>
  );
}

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionDrawer, setActionDrawer] = useState<{ agentId: string; label: string } | null>(null);
  const { open, sendMessage } = useAssistantActions();
  const { t } = useLang();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: stats } = useQuery({
    queryKey: ['agents', 'stats'],
    queryFn: () => api.getAgentStats(),
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });

  const signalMutation = useMutation({
    mutationFn: ({ id, signal }: { id: string; signal: any }) => api.signalAgent(id, signal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const emergencyStopMutation = useMutation({
    mutationFn: () => api.emergencyStop(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const tasksByType = AGENT_TYPES.map((type) => {
    const typeAgents = (agents ?? []).filter((a: any) => a.type === type);
    return {
      name: type.replace('_', ' '),
      completed: typeAgents.reduce((sum: number, a: any) => sum + (a.tasksCompleted ?? 0), 0),
      failed: typeAgents.reduce((sum: number, a: any) => sum + (a.tasksFailed ?? 0), 0),
    };
  });

  function askAboutAgent(agentType: string) {
    open();
    void sendMessage(`Give me a status update on the ${AGENT_LABELS[agentType] ?? agentType} including current health, recent failures, and recommended next action.`);
  }

  return (
    <div className="space-y-6">
      <WorkspaceGuidanceBanner surface="agents" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.agentsPage.heading}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.agentsPage.monitorSubtitle}</p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm(t.actions?.emergencyStopConfirm || 'Stop all agents immediately? This will pause all active processing.')) {
              emergencyStopMutation.mutate();
            }
          }}
          disabled={emergencyStopMutation.isPending}
        >
          <ShieldOff size={14} className="ltr:mr-1.5 rtl:ml-1.5" />
          {t.actions?.emergencyStop || 'Emergency Stop'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">{t.agentsPage.totalAgents}</p>
          <p className="mt-1 text-2xl font-bold">{agents?.length ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">{t.agentsPage.active}</p>
          <p className="mt-1 text-2xl font-bold text-green-400">
            {agents?.filter((a: any) => a.status === 'processing').length ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">{t.agentsPage.tasksToday}</p>
          <p className="mt-1 text-2xl font-bold">{stats?.tasksToday ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">{t.agentsPage.successRate}</p>
          <p className="mt-1 text-2xl font-bold">{((stats?.successRate ?? 0) * 100).toFixed(1)}%</p>
        </Card>
      </div>

      <Card>
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">{t.agentsPage.tasksByAgentType}</h3>
        <BarChartWidget
          data={tasksByType}
          bars={[
            { dataKey: 'completed', color: '#10b981' },
            { dataKey: 'failed', color: '#ef4444' },
          ]}
          xAxisKey="name"
        />
      </Card>

      {/* Agent fleet with telescope expand */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t.dashboard.agentFleet}</h3>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-4 w-1/3 rounded bg-secondary" />
                <div className="mt-2 h-3 w-1/4 rounded bg-secondary" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {(agents ?? []).map((agent: any) => {
              const isExpanded = expandedId === agent.id;
              const color = AGENT_COLORS[agent.type] ?? '#8b5cf6';
              const label = AGENT_LABELS[agent.type] ?? `${agent.type} Agent`;
              const completed = agent.tasksCompleted ?? 0;
              const failed = agent.tasksFailed ?? 0;
              const total = completed + failed;
              const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '—';
              const isRunning = agent.status === 'processing' || agent.status === 'active';

              return (
                <div
                  key={agent.id}
                  className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                    isExpanded ? 'border-primary/30 bg-card/80' : 'border-border bg-card/60 hover:border-border/80'
                  }`}
                >
                  {/* Header row (always visible) */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : agent.id)}
                    className="w-full flex items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center text-xs font-bold uppercase shrink-0"
                        style={{ backgroundColor: color + '18', color }}
                      >
                        {(agent.type ?? '??').slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{label}</p>
                          <AgentPulse status={agent.status} />
                          <Badge variant={STATUS_VARIANT[agent.status] ?? 'outline'}>{agent.status}</Badge>
                          <StreakBadge completed={completed} failed={failed} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {completed} completed · {failed} failed
                          {agent.lastHeartbeat && <> · Last active: {new Date(agent.lastHeartbeat).toLocaleTimeString()}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {agent.status === 'processing' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); signalMutation.mutate({ id: agent.id, signal: { type: 'pause' } }); }}
                        >
                          {t.agentsPage.pause}
                        </Button>
                      )}
                      {agent.status === 'paused' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); signalMutation.mutate({ id: agent.id, signal: { type: 'resume' } }); }}
                        >
                          {t.agentsPage.resume}
                        </Button>
                      )}
                      {agent.status === 'error' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); signalMutation.mutate({ id: agent.id, signal: { type: 'restart' } }); }}
                        >
                          {t.agentsPage.restart}
                        </Button>
                      )}
                      {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded telescope panel */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-4 animate-fade-in">
                      {/* Current task */}
                      {isRunning && (
                        <div className="rounded-xl bg-primary/5 border border-primary/10 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Loader2 size={14} className="animate-spin text-primary" />
                            <span className="text-xs font-semibold text-primary">{t.agentsPage.currentTask}</span>
                          </div>
                          <p className="text-sm text-foreground">{agent.currentTask ?? 'Processing queued tasks...'}</p>
                          {agent.taskStartedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Started {Math.round((Date.now() - new Date(agent.taskStartedAt).getTime()) / 1000)}s ago
                            </p>
                          )}
                        </div>
                      )}

                      {/* Performance stats */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-secondary/30 p-3 text-center">
                          <p className="text-lg font-bold">{completed}</p>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Completed</p>
                        </div>
                        <div className="rounded-xl bg-secondary/30 p-3 text-center">
                          <p className="text-lg font-bold text-red-400">{failed}</p>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Failed</p>
                        </div>
                        <div className="rounded-xl bg-secondary/30 p-3 text-center">
                          <p className="text-lg font-bold">{successRate}%</p>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Success Rate</p>
                        </div>
                      </div>

                      {/* Recent tasks (simulated from available data) */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Activity</p>
                        <div className="space-y-1.5">
                          {(agent.recentTasks ?? []).slice(0, 5).map((task: any, i: number) => (
                            <div key={task.id ?? i} className="flex items-center gap-2 text-xs">
                              {task.status === 'completed' ? <Check size={12} className="text-green-400" /> : <X size={12} className="text-red-400" />}
                              <span className="text-muted-foreground flex-1">{task.type?.replace(/_/g, ' ')}</span>
                              {task.completedAt && <span className="text-muted-foreground/50">{new Date(task.completedAt).toLocaleTimeString()}</span>}
                            </div>
                          ))}
                          {(!agent.recentTasks || agent.recentTasks.length === 0) && (
                            <p className="text-xs text-muted-foreground/60 py-2">No recent task history available</p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => setActionDrawer({ agentId: agent.id, label })}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/50 hover:bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors"
                        >
                          <Brain size={12} /> {t.actions?.viewActions || 'View Actions'}
                        </button>
                        <button
                          onClick={() => askAboutAgent(agent.type)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary transition-colors"
                        >
                          <Bot size={12} /> Ask NexusAI about this agent
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {(!agents || agents.length === 0) && (
              <Card className="text-center py-12">
                <p className="text-muted-foreground">No agents deployed yet.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Complete onboarding to deploy your AI swarm</p>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Action Drawer */}
      <ActionDrawer
        agentId={actionDrawer?.agentId ?? ''}
        agentLabel={actionDrawer?.label ?? ''}
        isOpen={!!actionDrawer}
        onClose={() => setActionDrawer(null)}
      />
    </div>
  );
}
