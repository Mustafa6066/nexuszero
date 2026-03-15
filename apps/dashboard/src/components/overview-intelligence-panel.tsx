'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Sparkles, Target } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { getOverviewPanelData, type DashboardOverviewIntelligence } from '@/lib/overview-intelligence';
import { useLang } from '@/app/providers';

export function OverviewIntelligencePanel({ intelligence }: { intelligence?: DashboardOverviewIntelligence | null }) {
  const router = useRouter();
  const panel = getOverviewPanelData(intelligence);
  const { t } = useLang();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[1.7rem] border-primary/15 bg-[linear-gradient(135deg,hsl(var(--card)/0.92),hsl(var(--background)/0.84))] p-5 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">{t.overviewIntelligence.strategicMission}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight">{panel.mission.title}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{panel.mission.detail}</p>
          {panel.mission.actionPath && panel.mission.actionLabel && (
            <Button className="mt-5 gap-1.5" onClick={() => router.push(panel.mission.actionPath!)}>
              {panel.mission.actionLabel}
              <ArrowRight size={14} />
            </Button>
          )}
        </Card>

        <Card className="rounded-[1.7rem] border-border/60 bg-card/70 p-5 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">{t.overviewIntelligence.workspaceHighlights}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {panel.highlights.length > 0 ? panel.highlights.map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/50 bg-secondary/20 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
                <div className="mt-2 text-lg font-semibold capitalize text-foreground">{item.value}</div>
              </div>
            )) : (
              <div className="col-span-2 rounded-2xl border border-border/50 bg-secondary/20 px-4 py-6 text-sm text-muted-foreground">
                {t.overviewIntelligence.highlightsEmpty}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-[1.6rem] border-border/60 bg-card/70 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">{t.overviewIntelligence.topOpportunities}</h3>
          </div>
          <div className="space-y-3">
            {panel.opportunities.length > 0 ? panel.opportunities.map((item) => (
              <div key={item.title} className="rounded-xl border border-border/60 bg-secondary/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.detail}</p>
                  </div>
                  {item.actionPath && item.actionLabel ? (
                    <Button size="sm" variant="outline" onClick={() => router.push(item.actionPath!)}>{item.actionLabel}</Button>
                  ) : (
                    <Badge variant="outline">Info</Badge>
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 text-sm text-muted-foreground">
                {t.overviewIntelligence.opportunitiesEmpty}
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[1.6rem] border-border/60 bg-card/70 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" />
            <h3 className="text-sm font-semibold">{t.overviewIntelligence.topRisks}</h3>
          </div>
          <div className="space-y-3">
            {panel.risks.length > 0 ? panel.risks.map((item) => (
              <div key={item.title} className="rounded-xl border border-border/60 bg-secondary/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <Badge variant={item.severity === 'critical' ? 'destructive' : item.severity === 'warning' ? 'warning' : 'outline'}>
                        {item.severity ?? 'info'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.detail}</p>
                  </div>
                  {item.actionPath && item.actionLabel ? (
                    <Button size="sm" variant="outline" onClick={() => router.push(item.actionPath!)}>{item.actionLabel}</Button>
                  ) : (
                    <Target size={14} className="shrink-0 text-yellow-400" />
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-green-500/20 bg-green-500/8 p-4 text-sm text-muted-foreground">
                {t.overviewIntelligence.risksEmpty}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}