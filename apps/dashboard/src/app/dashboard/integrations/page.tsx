'use client';

import { IntegrationGrid, OnboardingWizard } from '@/components/integrations';
import { WorkspaceGuidanceBanner } from '@/components/workspace-guidance-banner';
import { useLang } from '@/app/providers';

export default function IntegrationsPage() {
  const { t } = useLang();
  return (
    <div className="space-y-6">
      <WorkspaceGuidanceBanner surface="integrations" />

      <div>
        <h1 className="text-2xl font-bold">{t.integrationsPage.heading}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t.integrationsPage.subtitle}
        </p>
      </div>

      <OnboardingWizard />
      <IntegrationGrid />
    </div>
  );
}
