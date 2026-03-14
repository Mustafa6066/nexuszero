'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
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

  // Track newly achieved milestones for celebration
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const prevAchievedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Load previously seen achievements from localStorage
    try {
      const stored = localStorage.getItem('nexuszero_milestones');
      if (stored) prevAchievedRef.current = new Set(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const prev = prevAchievedRef.current;
    const currentAchieved = milestones.filter((m) => m.achieved).map((m) => m.id);
    const newlyAchieved = currentAchieved.filter((id) => !prev.has(id));

    if (newlyAchieved.length > 0) {
      setCelebrating(newlyAchieved[0]);
      setTimeout(() => setCelebrating(null), 2500);
      // Persist so we don't celebrate again
      const updated = new Set([...prev, ...currentAchieved]);
      prevAchievedRef.current = updated;
      try {
        localStorage.setItem('nexuszero_milestones', JSON.stringify([...updated]));
      } catch { /* ignore */ }
    }
  }, [milestones]);

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
          const isCelebrating = celebrating === m.id;
          return (
            <div
              key={m.id}
              className={`px-5 py-3 flex items-center gap-3.5 transition-all relative overflow-hidden ${
                m.achieved ? 'bg-primary/[0.02]' : ''
              } ${isCelebrating ? 'ring-2 ring-amber-400/40 bg-amber-400/5' : ''}`}
              style={isCelebrating ? { animation: 'milestonePopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' } : undefined}
            >
              {isCelebrating && (
                <>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <span
                      key={i}
                      className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
                      style={{
                        left: '32px',
                        top: '50%',
                        backgroundColor: ['#fbbf24', '#818cf8', '#38bdf8', '#10b981', '#ec4899', '#f59e0b'][i % 6],
                        animation: `milestoneBurst 0.8s ease-out forwards`,
                        animationDelay: `${i * 40}ms`,
                        transform: `rotate(${i * 30}deg)`,
                      }}
                    />
                  ))}
                  <style>{`
                    @keyframes milestonePopIn {
                      0% { transform: scale(0.95); opacity: 0.8; }
                      50% { transform: scale(1.03); }
                      100% { transform: scale(1); opacity: 1; }
                    }
                    @keyframes milestoneBurst {
                      0% { transform: translateX(0) translateY(0) scale(1); opacity: 1; }
                      100% { transform: translateX(${Math.cos(0) * 40}px) translateY(${Math.sin(0) * 40}px) scale(0); opacity: 0; }
                    }
                  `}</style>
                </>
              )}
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
