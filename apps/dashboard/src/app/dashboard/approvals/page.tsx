'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import { useRole } from '@/hooks/use-role';
import { ShieldCheck, ShieldAlert, Clock, CheckCircle, XCircle, Bot } from 'lucide-react';
import { DashboardSectionBoundary } from '@/components/dashboard-section-boundary';
import { useLang } from '@/app/providers';

const AUTONOMY_ICONS: Record<string, typeof ShieldCheck> = {
  manual: ShieldCheck,
  guardrailed: ShieldAlert,
  autonomous: Bot,
};

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const { canAdmin, isOwner } = useRole();
  const { t } = useLang();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [error, setError] = useState<string | null>(null);

  const autonomyLabels: Record<string, { label: string; description: string; icon: typeof ShieldCheck }> = {
    manual: { label: t.approvalsPage.fullManual, description: t.approvalsPage.fullManualDesc, icon: ShieldCheck },
    guardrailed: { label: t.approvalsPage.guardrailed, description: t.approvalsPage.guardrailedDesc, icon: ShieldAlert },
    autonomous: { label: t.approvalsPage.fullAutonomy, description: t.approvalsPage.fullAutonomyDesc, icon: Bot },
  };

  const filterLabels: Record<string, string> = {
    pending: t.approvalsPage.pending,
    approved: t.approvalsPage.approved,
    rejected: t.approvalsPage.rejected,
  };

  const { data: approvals, isLoading } = useQuery({
    queryKey: ['approvals', filter],
    queryFn: () => api.getApprovals(filter),
  });

  const { data: autonomy } = useQuery({
    queryKey: ['autonomy'],
    queryFn: () => api.getAutonomyLevel(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveItem(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['approvals'] }); setError(null); },
    onError: (err: any) => setError(err?.message || 'Failed to approve item'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectItem(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['approvals'] }); setError(null); },
    onError: (err: any) => setError(err?.message || 'Failed to reject item'),
  });

  const autonomyMutation = useMutation({
    mutationFn: (level: string) => api.setAutonomyLevel(level),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['autonomy'] }); setError(null); },
    onError: (err: any) => setError(err?.message || 'Failed to change autonomy level'),
  });

  const currentLevel = autonomy?.autonomyLevel ?? 'manual';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.approvalsPage.heading}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.approvalsPage.approvalSubtitle}</p>
      </div>

      {error && <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{error}</div>}

      {/* Autonomy Level Selector */}
      <Card>
        <h3 className="text-sm font-semibold mb-4">{t.approvalsPage.autonomyLevel}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(autonomyLabels).map(([key, { label, description, icon: Icon }]) => (
            <button
              key={key}
              onClick={() => isOwner && autonomyMutation.mutate(key)}
              disabled={!isOwner || autonomyMutation.isPending}
              className={`rounded-xl border px-4 py-4 text-left transition-all ${
                currentLevel === key
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/30 hover:bg-secondary/30'
              } ${!isOwner ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={currentLevel === key ? 'text-primary' : 'text-muted-foreground'} />
                <span className="text-sm font-semibold">{label}</span>
                {currentLevel === key && <Badge variant="success">{t.approvalsPage.active}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            </button>
          ))}
        </div>
        {!isOwner && <p className="mt-3 text-xs text-muted-foreground">{t.approvalsPage.ownerOnly}</p>}
      </Card>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
              filter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {s === 'pending' && <Clock size={12} className="inline mr-1" />}
            {s === 'approved' && <CheckCircle size={12} className="inline mr-1" />}
            {s === 'rejected' && <XCircle size={12} className="inline mr-1" />}
            {filterLabels[s]}
          </button>
        ))}
      </div>

      {/* Approval List */}
      <DashboardSectionBoundary>
        {isLoading ? (
          <Card className="animate-pulse"><div className="h-20 rounded bg-secondary" /></Card>
        ) : !approvals?.length ? (
          <Card className="text-center py-12">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-sm font-medium">{t.approvalsPage.noPendingApprovals}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {filter === 'pending' ? t.approvalsPage.allClearApprovals : `${filter} ${t.approvalsPage.noItemsToShow}`}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {approvals.map((item: any) => (
              <Card key={item.id} className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={item.priority === 'critical' ? 'destructive' : item.priority === 'high' ? 'warning' : 'outline'}>
                      {item.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground capitalize">{item.agentType} Agent</span>
                  </div>
                  <p className="text-sm font-medium">{item.actionType}</p>
                  {item.thresholdHit && (
                    <p className="text-xs text-muted-foreground mt-1">Threshold: {item.thresholdHit}</p>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span>Proposed: </span>
                    <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">
                      {JSON.stringify(item.proposedChange).slice(0, 120)}
                    </code>
                  </div>
                  {item.reviewNote && (
                    <p className="mt-2 text-xs italic text-muted-foreground">Note: {item.reviewNote}</p>
                  )}
                </div>
                {filter === 'pending' && canAdmin && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(item.id)}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle size={12} className="mr-1" /> {t.approvalsPage.approve}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(item.id)}
                      disabled={rejectMutation.isPending}
                    >
                      <XCircle size={12} className="mr-1" /> {t.approvalsPage.reject}
                    </Button>
                  </div>
                )}
                {filter !== 'pending' && (
                  <Badge variant={item.status === 'approved' ? 'success' : 'destructive'}>
                    {item.status}
                  </Badge>
                )}
              </Card>
            ))}
          </div>
        )}
      </DashboardSectionBoundary>
    </div>
  );
}
