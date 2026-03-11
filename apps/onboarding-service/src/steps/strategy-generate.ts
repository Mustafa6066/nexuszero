import { getDb, tenants, campaigns } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { publishAgentTask } from '@nexuszero/queue';

/**
 * Strategy Generate Step
 * Uses AI agents to generate an initial marketing strategy based on
 * the audit results and the tenant's connected platforms.
 */
export class StrategyGenerateStep {
  async execute(tenantId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = getDb();

    const [tenant] = await db.select().from(tenants)
      .where(eq(tenants.id, tenantId)).limit(1);

    if (!tenant) throw new Error('Tenant not found');

    const auditResults = config.auditResults as Record<string, unknown> | undefined;

    // Queue keyword research for SEO strategy
    const keywordTaskId = crypto.randomUUID();
    await publishAgentTask({
      id: keywordTaskId,
      tenantId,
      agentType: 'seo',
      type: 'keyword_research',
      priority: 'high',
      input: {
        isOnboarding: true,
        domain: tenant.domain,
        auditFindings: auditResults,
      },
    });

    // Queue initial data analysis
    const analysisTaskId = crypto.randomUUID();
    await publishAgentTask({
      id: analysisTaskId,
      tenantId,
      agentType: 'data-nexus',
      type: 'daily_analysis',
      priority: 'high',
      input: {
        isOnboarding: true,
      },
    });

    // Queue AEO entity setup if applicable
    let aeoTaskId: string | null = null;
    if (tenant.plan !== 'launchpad') {
      aeoTaskId = crypto.randomUUID();
      await publishAgentTask({
        id: aeoTaskId,
        tenantId,
        agentType: 'aeo',
        type: 'analyze_visibility',
        priority: 'medium',
        input: {
          isOnboarding: true,
        },
      });
    }

    return {
      strategyTasks: {
        keywordResearch: keywordTaskId,
        dataAnalysis: analysisTaskId,
        aeoVisibility: aeoTaskId,
      },
      autoGoLive: (config as any).autoGoLive ?? false,
    };
  }
}
