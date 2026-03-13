import { getDb, tenants, agents } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { PLAN_AGENT_LIMITS } from '@nexuszero/shared';
import type { PlanTier } from '@nexuszero/shared';

const AGENT_TYPES = ['seo', 'ad', 'creative', 'data_nexus', 'aeo'] as const;

/**
 * Provision Step
 * Creates agent records for the tenant based on their plan tier.
 * Sets up the agent swarm that will manage their marketing.
 */
export class ProvisionStep {
  async execute(tenantId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = getDb();

    const [tenant] = await db.select({ plan: tenants.plan })
      .from(tenants).where(eq(tenants.id, tenantId)).limit(1);

    if (!tenant) throw new Error('Tenant not found');

    const plan = tenant.plan as PlanTier;
    const limits = PLAN_AGENT_LIMITS[plan];

    // Determine which agents to provision based on plan
    const agentsToProvision: Array<{ type: string; enabled: boolean }> = [
      { type: 'seo', enabled: true }, // Always enabled
      { type: 'ad', enabled: true },  // Always enabled
      { type: 'creative', enabled: true }, // Always enabled
      { type: 'data-nexus', enabled: plan !== 'launchpad' }, // Growth+ only
      { type: 'aeo', enabled: plan === 'enterprise' || plan === 'growth' }, // Growth+ only
    ];

    const provisioned: string[] = [];

    // Query existing agents once upfront instead of per-iteration
    const existingAgents = await db.select().from(agents)
      .where(eq(agents.tenantId, tenantId));

    for (const agentDef of agentsToProvision) {
      if (!agentDef.enabled) continue;

      const alreadyExists = existingAgents.some(a => a.type === agentDef.type);

      if (!alreadyExists) {
        await db.insert(agents).values({
          tenantId,
          type: agentDef.type as any,
          status: 'idle',
          metadata: {
            provisionedAt: new Date().toISOString(),
            plan,
          },
        });
      }

      provisioned.push(agentDef.type);
    }

    // Update tenant status to provisioning
    await db.update(tenants).set({
      status: 'provisioning',
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    return {
      provisionedAgents: provisioned,
      plan,
      maxConcurrentTasks: limits?.maxConcurrentTasks ?? 5,
      agentsEnabled: provisioned.length,
    };
  }
}
