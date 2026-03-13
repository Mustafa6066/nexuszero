import { randomUUID } from 'node:crypto';
import { getDb, tenants, campaigns } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { publishAgentTask } from '@nexuszero/queue';

/**
 * Instant Audit Step
 * Runs a quick SEO audit and analyzes existing campaigns to provide
 * an initial assessment of the tenant's marketing posture.
 */
export class InstantAuditStep {
  async execute(tenantId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = getDb();

    // Get tenant info
    const [tenant] = await db.select().from(tenants)
      .where(eq(tenants.id, tenantId)).limit(1);

    if (!tenant) throw new Error('Tenant not found');

    // Check for existing campaigns imported via OAuth
    const existingCampaigns = await db.select().from(campaigns)
      .where(eq(campaigns.tenantId, tenantId));

    // Queue SEO audit task
    const seoTaskId = randomUUID();
    await publishAgentTask({
      id: seoTaskId,
      tenantId,
      agentType: 'seo',
      type: 'seo_audit',
      priority: 'high',
      input: {
        isOnboardingAudit: true,
        domain: tenant.domain,
      },
    });

    // Build initial assessment
    const assessment = {
      tenantName: tenant.name,
      domain: tenant.domain,
      plan: tenant.plan,
      existingCampaignCount: existingCampaigns.length,
      campaignTypes: [...new Set(existingCampaigns.map(c => c.type))],
      totalBudget: existingCampaigns.reduce((sum, c) => sum + ((c.budget as number) || 0), 0),
      activeCampaigns: existingCampaigns.filter(c => c.status === 'active').length,
      seoAuditTaskId: seoTaskId,
      auditTimestamp: new Date().toISOString(),
    };

    return assessment;
  }
}
