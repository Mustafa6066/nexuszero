'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Flame, Trophy, TrendingUp } from 'lucide-react';
import { useLang } from '@/app/providers';

const RANKS = [
  { key: 'recruit', label: 'Recruit', min: 0, color: 'text-zinc-400', bg: 'bg-zinc-500/10' },
  { key: 'operator', label: 'Operator', min: 5, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { key: 'strategist', label: 'Strategist', min: 15, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { key: 'commander', label: 'Commander', min: 30, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { key: 'nexus_elite', label: 'Nexus Elite', min: 60, color: 'text-green-400', bg: 'bg-green-500/10' },
] as const;

function getRankInfo(rank: string) {
  return RANKS.find((r) => r.key === rank) ?? RANKS[0];
}

function getNextRank(rank: string) {
  const idx = RANKS.findIndex((r) => r.key === rank);
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
}

export function StreakWidget() {
  const { data: streak, isLoading } = useQuery({
    queryKey: ['streaks', 'me'],
    queryFn: () => api.getMyStreak(),
    staleTime: 60_000,
  });
  const { t } = useLang();

  const rankLabels: Record<string, string> = {
    recruit: t.streakWidget.recruit,
    operator: t.streakWidget.operator,
    strategist: t.streakWidget.strategist,
    commander: t.streakWidget.commander,
    nexus_elite: t.streakWidget.nexusElite,
  };

  if (isLoading || !streak) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4 animate-pulse">
        <div className="h-16" />
      </div>
    );
  }

  const rankInfo = getRankInfo(streak.rank ?? 'recruit');
  const nextRank = getNextRank(streak.rank ?? 'recruit');
  const currentStreak = streak.currentStreak ?? 0;
  const longestStreak = streak.longestStreak ?? 0;
  const progressToNext = nextRank ? Math.min(100, Math.round((currentStreak / nextRank.min) * 100)) : 100;

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${rankInfo.bg} flex items-center justify-center`}>
            <Trophy size={16} className={rankInfo.color} />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${rankInfo.color}`}>{rankLabels[rankInfo.key] ?? rankInfo.label}</p>
            <p className="text-[10px] text-muted-foreground">{t.streakWidget.rank}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Flame size={18} className={currentStreak > 0 ? 'text-orange-400' : 'text-muted-foreground'} />
          <span className="text-lg font-bold tabular-nums">{currentStreak}</span>
          <span className="text-xs text-muted-foreground">{t.streakWidget.dayStreak}</span>
        </div>
      </div>

      {nextRank && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">
              Next: <span className={nextRank.color}>{rankLabels[nextRank.key] ?? nextRank.label}</span>
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {currentStreak}/{nextRank.min} days
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-700"
              style={{ width: `${progressToNext}%` }}
            />
          </div>
        </div>
      )}

      {longestStreak > currentStreak && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <TrendingUp size={10} />
          Best streak: {longestStreak} days
        </div>
      )}
    </div>
  );
}
