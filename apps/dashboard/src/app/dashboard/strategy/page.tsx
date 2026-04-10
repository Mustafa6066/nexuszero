'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';
import {
  Target, RefreshCw, CheckCircle2, Clock, ArrowRight,
  TrendingUp, Zap, Bot, Calendar, ChevronDown, ChevronUp,
} from 'lucide-react';

const STATUS_STYLES: Record<string, { color: string; icon: typeof Clock; label: string }> = {
  pending: { color: 'bg-zinc-500/20 text-zinc-400', icon: Clock, label: 'Pending' },
  in_progress: { color: 'bg-blue-500/20 text-blue-400', icon: Zap, label: 'In Progress' },
  completed: { color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle2, label: 'Completed' },
  skipped: { color: 'bg-zinc-500/10 text-zinc-500', icon: ArrowRight, label: 'Skipped' },
};

const AGENT_COLORS: Record<string, string> = {
  seo: 'text-blue-400',
  aeo: 'text-purple-400',
  social: 'text-pink-400',
  content: 'text-amber-400',
  ad: 'text-red-400',
  geo: 'text-emerald-400',
  'data-nexus': 'text-cyan-400',
  creative: 'text-orange-400',
};

export default function StrategyPage() {
  const queryClient = useQueryClient();
  const [expandedPhase, setExpandedPhase] = useState<number>(0);

  const { data: strategy, isLoading, error } = useQuery({
    queryKey: ['strategy'],
    queryFn: () => api.getStrategy(),
    retry: false,
  });

  const { data: timeline } = useQuery({
    queryKey: ['strategy-timeline'],
    queryFn: () => api.getStrategyTimeline(),
    enabled: !!strategy,
  });

  const regenerateMutation = useMutation({
    mutationFn: () => api.regenerateStrategy(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy'] });
      queryClient.invalidateQueries({ queryKey: ['strategy-timeline'] });
    },
  });

  const milestoneMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateMilestone(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy'] });
      queryClient.invalidateQueries({ queryKey: ['strategy-timeline'] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-white/5" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-white/5" />)}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <Target className="h-12 w-12 text-zinc-500" />
        <h2 className="text-xl font-semibold text-zinc-200">No Strategy Generated Yet</h2>
        <p className="text-sm text-zinc-400 max-w-md">
          Complete your onboarding to generate a personalized 90-day marketing strategy, or generate one now.
        </p>
        <Button
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending}
          className="mt-2"
        >
          {regenerateMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
          Generate Strategy
        </Button>
      </div>
    );
  }

  const milestones = (strategy.milestones ?? []) as any[];
  const completedCount = milestones.filter((m: any) => m.status === 'completed').length;
  const progressPct = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Target className="h-6 w-6 text-blue-400" />
            Your 90-Day Strategy
          </h1>
          {strategy.summary && (
            <p className="mt-1 text-sm text-zinc-400 max-w-2xl">{strategy.summary}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending}
        >
          {regenerateMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Regenerate
        </Button>
      </div>

      {/* KPI Cards */}
      {strategy.kpis && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(strategy.kpis as any[]).map((kpi: any, i: number) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{kpi.metric}</span>
                <TrendingUp className={`h-3.5 w-3.5 ${AGENT_COLORS[kpi.trackingAgent] ?? 'text-zinc-400'}`} />
              </div>
              <div className="mt-2 text-lg font-semibold text-zinc-100">{kpi.target}</div>
              <div className="text-xs text-zinc-500">from {kpi.baseline}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Progress Bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-300">Overall Progress</span>
          <span className="text-sm font-semibold text-zinc-100">{progressPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-zinc-500">
          <span>{completedCount} of {milestones.length} milestones completed</span>
          {strategy.generatedAt && (
            <span>Generated {new Date(strategy.generatedAt).toLocaleDateString()}</span>
          )}
        </div>
      </Card>

      {/* First Mission */}
      {strategy.firstMission && (
        <Card className="border-blue-500/20 bg-blue-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-500/20 p-2">
              <Zap className="h-5 w-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-300">First Mission: {strategy.firstMission.title}</h3>
              <p className="mt-1 text-sm text-zinc-400">{strategy.firstMission.description}</p>
              <div className="mt-2 flex items-center gap-3 text-xs">
                {strategy.firstMission.agentType && (
                  <Badge className={AGENT_COLORS[strategy.firstMission.agentType]}>
                    <Bot className="h-3 w-3 mr-1" /> {strategy.firstMission.agentType}
                  </Badge>
                )}
                {strategy.firstMission.estimatedImpact && (
                  <span className="text-zinc-500">{strategy.firstMission.estimatedImpact}</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Phases */}
      {strategy.phases && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-zinc-400" />
            Strategy Phases
          </h2>
          {(strategy.phases as any[]).map((phase: any, idx: number) => {
            const isExpanded = expandedPhase === idx;
            const phaseMilestones = milestones.filter((m: any) => {
              const week = m.week ?? 0;
              if (idx === 0) return week >= 1 && week <= 4;
              if (idx === 1) return week >= 5 && week <= 8;
              return week >= 9 && week <= 12;
            });
            const phaseCompleted = phaseMilestones.filter((m: any) => m.status === 'completed').length;

            return (
              <Card key={idx} className="overflow-hidden">
                <button
                  onClick={() => setExpandedPhase(isExpanded ? -1 : idx)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      idx === 0 ? 'bg-blue-500/20 text-blue-400' :
                      idx === 1 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-medium text-zinc-200">{phase.name}</div>
                      <div className="text-xs text-zinc-500">Weeks {phase.weeks} &middot; {phase.focus}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{phaseCompleted}/{phaseMilestones.length}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/5 p-4 space-y-3">
                    {phase.actions && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(phase.actions as string[]).map((action: string, i: number) => (
                          <Badge key={i} className="bg-white/5 text-zinc-400 text-xs">{action}</Badge>
                        ))}
                      </div>
                    )}

                    {phaseMilestones.length > 0 ? (
                      <div className="space-y-2">
                        {phaseMilestones.map((m: any) => {
                          const statusInfo = STATUS_STYLES[m.status] ?? STATUS_STYLES.pending;
                          const StatusIcon = statusInfo.icon;
                          return (
                            <div key={m.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] p-3">
                              <div className="flex items-center gap-3">
                                <StatusIcon className={`h-4 w-4 ${statusInfo.color.split(' ')[1]}`} />
                                <div>
                                  <div className="text-sm font-medium text-zinc-300">{m.title}</div>
                                  <div className="text-xs text-zinc-500">{m.description}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {m.agentType && (
                                  <span className={`text-xs ${AGENT_COLORS[m.agentType] ?? 'text-zinc-500'}`}>
                                    {m.agentType}
                                  </span>
                                )}
                                {m.automated && <Bot className="h-3 w-3 text-zinc-600" title="Automated" />}
                                {m.status === 'pending' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => milestoneMutation.mutate({ id: m.id, status: 'in_progress' })}
                                    disabled={milestoneMutation.isPending}
                                    className="text-xs h-7"
                                  >
                                    Start
                                  </Button>
                                )}
                                {m.status === 'in_progress' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => milestoneMutation.mutate({ id: m.id, status: 'completed' })}
                                    disabled={milestoneMutation.isPending}
                                    className="text-xs h-7 text-emerald-400"
                                  >
                                    Complete
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">No milestones in this phase yet.</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Timeline View */}
      {timeline?.weeks && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-200">Weekly Timeline</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(timeline.weeks as any[]).map((week: any) => (
              <Card key={week.week} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-400">Week {week.week}</span>
                  <span className="text-xs text-zinc-500">{week.completed}/{week.total}</span>
                </div>
                <div className="space-y-1">
                  {(week.milestones as any[]).map((m: any) => {
                    const statusInfo = STATUS_STYLES[m.status] ?? STATUS_STYLES.pending;
                    return (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          m.status === 'completed' ? 'bg-emerald-400' :
                          m.status === 'in_progress' ? 'bg-blue-400' : 'bg-zinc-600'
                        }`} />
                        <span className={m.status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-300'}>
                          {m.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
