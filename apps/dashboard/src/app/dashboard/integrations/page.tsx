'use client';

import { IntegrationGrid, OnboardingWizard } from '@/components/integrations';
import { WorkspaceGuidanceBanner } from '@/components/workspace-guidance-banner';

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <WorkspaceGuidanceBanner surface="integrations" />

      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your connected platforms, monitor health, and onboard new tools.
        </p>
      </div>

      <OnboardingWizard />
      <IntegrationGrid />
    </div>
  );
}
