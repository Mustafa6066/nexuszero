'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Trophy, Flame, Rocket, Target, Star, Zap, TrendingUp } from 'lucide-react';

interface Milestone {
  id: string;
  label: string;
  description: string;
  icon: typeof Trophy;
  color: string;
  achieved: boolean;
  progress: number; // 0-1
}

function computeMilestones(
  agents: any[],
  stats: any,
  summary: any,
  campaigns: any[],
): Milestone[] {
  const totalTasks = agents?.reduce((s: number, a: any) => s + (a.tasksCompleted ?? 0), 0) ?? 0;
  const totalFailed = agents?.reduce((s: number, a: any) => s + (a.tasksFailed ?? 0), 0) ?? 0;
  const successRate = totalTasks + totalFailed > 0 ? totalTasks / (totalTasks + totalFailed) : 0;
  const agentCount = agents?.length ?? 0;
  const campaignCount = campaigns?.length ?? 0;
  const revenue = summary?.totalRevenue ?? 0;

  return [
    {
      id: 'first-agent',
      label: 'First Agent Deployed',
      description: 'Deploy your first AI agent',
      icon: Rocket,
      color: 'text-primary',
      achieved: agentCount >= 1,
      progress: Math.min(agentCount / 1, 1),
    },
    {
      id: 'full-fleet',
      label: 'Full Fleet',
      description: 'Deploy all 5 agent types',
      icon: Zap,
      color: 'text-amber-400',
      achieved: agentCount >= 5,
      progress: Math.min(agentCount / 5, 1),
    },
    {
      id: 'first-campaign',
      label: 'Campaign Commander',
      description: 'Create your first campaign',
      icon: Target,
      color: 'text-pink-400',
      achieved: campaignCount >= 1,
      progress: Math.min(campaignCount / 1, 1),
    },
    {
      id: 'task-centurion',
      label: 'Task Centurion',
      description: 'Complete 100 agent tasks',
      icon: Star,
      color: 'text-emerald-500',
      achieved: totalTasks >= 100,
      progress: Math.min(totalTasks / 100, 1),
    },
    {
      id: 'task-legend',
      label: 'Task Legend',
      description: 'Complete 1,000 agent tasks',
      icon: Trophy,
      color: 'text-yellow-400',
      achieved: totalTasks >= 1000,
      progress: Math.min(totalTasks / 1000, 1),
    },
    {
      id: 'precision',
      label: 'Precision Machine',
      description: 'Achieve 95%+ agent success rate',
      icon: Flame,
      color: 'text-orange-400',
      achieved: successRate >= 0.95 && totalTasks > 10,
      progress: totalTasks > 0 ? Math.min(successRate / 0.95, 1) : 0,
    },
    {
      id: 'revenue-1k',
      label: 'Revenue Milestone',
      description: 'Generate $1,000+ in tracked revenue',
      icon: TrendingUp,
      color: 'text-green-400',
      achieved: revenue >= 1000,
      progress: Math.min(revenue / 1000, 1),
    },
  ];
}

export function MilestonesPanel() {
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    staleTime: 60000,
  });

  const { data: stats } = useQuery({
    queryKey: ['agents', 'stats'],
    queryFn: () => api.getAgentStats(),
    staleTime: 60000,
  });

  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalyticsSummary(),
    staleTime: 60000,
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.getCampaigns(),
    staleTime: 60000,
  });

  const milestones = useMemo(
    () => computeMilestones(agents ?? [], stats, summary, campaigns ?? []),
    [agents, stats, summary, campaigns],
  );

  const achieved = milestones.filter((m) => m.achieved).length;

  return (
    <div className="rounded-2xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-amber-400" />
          <h3 className="text-sm font-semibold">Milestones</h3>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {achieved}/{milestones.length} achieved
        </span>
      </div>
      <div className="divide-y divide-border/20">
        {milestones.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.id}
              className={`px-5 py-3 flex items-center gap-3.5 transition-colors ${
                m.achieved ? 'bg-primary/[0.02]' : ''
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                m.achieved ? 'bg-primary/10' : 'bg-secondary/40'
              }`}>
                <Icon size={14} className={m.achieved ? m.color : 'text-muted-foreground/40'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-xs font-semibold ${m.achieved ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {m.label}
                  </p>
                  {m.achieved && (
                    <span className="text-[10px] font-bold text-green-400 uppercase">Done</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">{m.description}</p>
                {!m.achieved && (
                  <div className="mt-1.5 h-1 w-full rounded-full bg-secondary/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/50 transition-all duration-500"
                      style={{ width: `${m.progress * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
