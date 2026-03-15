'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Button, MetricCard } from '@/components/ui';
import { BarChartWidget } from '@/components/charts';
import { TierGateOverlay } from '@/components/tier-gate-overlay';
import { WorkspaceGuidanceBanner } from '@/components/workspace-guidance-banner';
import { useLang } from '@/app/providers';

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt: '#10a37f',
  perplexity: '#5436da',
  gemini: '#4285f4',
  copilot: '#7c3aed',
  claude: '#d97706',
  alexa: '#00caff',
};

export default function AEOPage() {
  const queryClient = useQueryClient();
  const { t } = useLang();

  const { data: citations, isLoading: citationsLoading } = useQuery({
    queryKey: ['aeo', 'citations'],
    queryFn: () => api.getCitations(),
  });

  const { data: entities } = useQuery({
    queryKey: ['aeo', 'entities'],
    queryFn: () => api.getEntities(),
  });

  const { data: visibility } = useQuery({
    queryKey: ['aeo', 'visibility'],
    queryFn: () => api.getVisibility(),
  });

  const scanMutation = useMutation({
    mutationFn: () => api.scanCitations({}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aeo'] });
    },
  });

  const totalCitations = citations?.length ?? 0;
  const positiveCitations = citations?.filter((c: any) => c.sentiment === 'positive').length ?? 0;
  const avgVisibility = visibility?.length
    ? (visibility.reduce((sum: number, v: any) => sum + (v.score ?? 0), 0) / visibility.length * 100).toFixed(1)
    : '0';

  const visibilityByPlatform = (visibility ?? []).map((v: any) => ({
    name: v.platform,
    score: Math.round((v.score ?? 0) * 100),
  }));

  return (
    <TierGateOverlay
      feature="AI Engine Optimization"
      description="Track your brand mentions across ChatGPT, Perplexity, Gemini, and other AI platforms. Optimize your visibility in AI-powered search results."
      requiredTier="growth"
    >
    <div className="space-y-6">
      <WorkspaceGuidanceBanner surface="aeo" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.aeoPage.heading}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.aeoPage.aeoSubtitle}</p>
        </div>
        <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
          {scanMutation.isPending ? t.aeoPage.scanningDots : t.aeoPage.runCitationScan}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title={t.aeoPage.totalCitations} value={String(totalCitations)} />
        <MetricCard title={t.aeoPage.positiveMentions} value={String(positiveCitations)} changeType="positive" change={totalCitations > 0 ? `${((positiveCitations / totalCitations) * 100).toFixed(0)}% positive` : undefined} />
        <MetricCard title={t.aeoPage.avgVisibilityScore} value={`${avgVisibility}%`} />
        <MetricCard title={t.aeoPage.trackedEntities} value={String(entities?.length ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">{t.aeoPage.visibilityByPlatform}</h3>
          {visibilityByPlatform.length > 0 ? (
            <BarChartWidget
              data={visibilityByPlatform}
              bars={[{ dataKey: 'score', color: '#8b5cf6' }]}
              xAxisKey="name"
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">{t.aeoPage.noVisibilityData}</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">{t.aeoPage.entityProfiles}</h3>
          <div className="space-y-3">
            {(entities ?? []).slice(0, 8).map((entity: any) => (
              <div key={entity.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{entity.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{entity.entity_type}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{entity.citations_count ?? 0} citations</p>
                  <Badge variant={entity.schema_status === 'optimized' ? 'success' : 'warning'}>
                    {entity.schema_status ?? 'needs review'}
                  </Badge>
                </div>
              </div>
            ))}
            {(!entities || entities.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">{t.aeoPage.noEntitiesTracked}</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">{t.aeoPage.recentCitations}</h3>
        {citationsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-lg border border-border p-4">
                <div className="h-4 w-2/3 rounded bg-secondary" />
                <div className="mt-2 h-3 w-1/3 rounded bg-secondary" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {(citations ?? []).slice(0, 10).map((citation: any) => (
              <div key={citation.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{citation.query ?? 'Unknown query'}</p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{citation.context ?? citation.snippet}</p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: (PLATFORM_COLORS[citation.platform] ?? '#666') + '20',
                        color: PLATFORM_COLORS[citation.platform] ?? '#999',
                      }}
                    >
                      {citation.platform}
                    </span>
                    <Badge variant={
                      citation.sentiment === 'positive' ? 'success' :
                      citation.sentiment === 'negative' ? 'destructive' :
                      'outline'
                    }>
                      {citation.sentiment ?? 'neutral'}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Position: {citation.position ?? 'N/A'}</span>
                  <span>Confidence: {((citation.confidence ?? 0) * 100).toFixed(0)}%</span>
                  {citation.detected_at && <span>{new Date(citation.detected_at).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
            {(!citations || citations.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">{t.aeoPage.noCitationsFound}</p>
            )}
          </div>
        )}
      </Card>
    </div>
    </TierGateOverlay>
  );
}
