'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button } from '@/components/ui';
import { useLang } from '@/app/providers';
import { History, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface VersionHistoryProps {
  campaignId: string;
  campaignName: string;
}

export function VersionHistory({ campaignId, campaignName }: VersionHistoryProps) {
  const queryClient = useQueryClient();
  const { t } = useLang();
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const { data: versions, isLoading } = useQuery({
    queryKey: ['campaign-versions', campaignId],
    queryFn: () => api.getCampaignVersions(campaignId),
    enabled: !!campaignId,
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => api.rollbackCampaign(campaignId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-versions', campaignId] });
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-secondary/50" />)}
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="text-center py-6">
        <History size={24} className="mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">{t.versions?.noVersions || 'No version history yet'}</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {t.versions?.noVersionsDesc || 'Versions are created automatically when campaigns are updated.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <History size={14} className="text-primary" />
        <h4 className="text-sm font-semibold">{t.versions?.heading || 'Version History'}</h4>
        <span className="text-xs text-muted-foreground">({versions.length})</span>
      </div>

      {versions.map((version: any) => {
        const isExpanded = expandedVersion === version.id;
        return (
          <div
            key={version.id}
            className="rounded-lg border border-border overflow-hidden"
          >
            <button
              onClick={() => setExpandedVersion(isExpanded ? null : version.id)}
              className="w-full flex items-center justify-between p-3 hover:bg-secondary/20 transition-colors text-start"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-secondary/50 flex items-center justify-center text-xs font-bold">
                  v{version.version}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{version.changeReason || 'Update'}</span>
                    <Badge variant={version.changedBy === 'user' ? 'outline' : 'default'}>
                      {version.changedBy}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(version.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t.versions?.rollbackConfirm || `Rollback "${campaignName}" to version ${version.version}?`)) {
                      rollbackMutation.mutate(version.id);
                    }
                  }}
                  disabled={rollbackMutation.isPending}
                >
                  <RotateCcw size={12} className="ltr:mr-1 rtl:ml-1" />
                  {t.versions?.rollback || 'Rollback'}
                </Button>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {isExpanded && version.snapshot && (
              <div className="border-t border-border p-3 bg-secondary/10">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                  {t.versions?.snapshot || 'Campaign State at this Version'}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {version.snapshot.name && (
                    <div><span className="text-muted-foreground">Name:</span> {version.snapshot.name}</div>
                  )}
                  {version.snapshot.status && (
                    <div><span className="text-muted-foreground">Status:</span> {version.snapshot.status}</div>
                  )}
                  {version.snapshot.platform && (
                    <div><span className="text-muted-foreground">Platform:</span> {version.snapshot.platform}</div>
                  )}
                  {version.snapshot.spend != null && (
                    <div><span className="text-muted-foreground">Spend:</span> ${version.snapshot.spend}</div>
                  )}
                  {version.snapshot.roas != null && (
                    <div><span className="text-muted-foreground">ROAS:</span> {version.snapshot.roas}x</div>
                  )}
                </div>
                {version.snapshot.budget && (
                  <div className="mt-2">
                    <span className="text-[10px] text-muted-foreground">Budget:</span>
                    <pre className="text-[10px] text-muted-foreground mt-0.5 overflow-x-auto">
                      {JSON.stringify(version.snapshot.budget, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
