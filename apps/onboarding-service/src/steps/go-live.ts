import { getDb, tenants, agents } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';

/**
 * Go Live Step
 * Activates all provisioned agents and marks the tenant as fully onboarded.
 */
export class GoLiveStep {
  async execute(tenantId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = getDb();

    // Activate all idle agents for this tenant
    const tenantAgents = await db.select().from(agents)
      .where(eq(agents.tenantId, tenantId));

    let activated = 0;
    for (const agent of tenantAgents) {
      if (agent.status === 'idle' || agent.status === 'error') {
        await db.update(agents)
          .set({
            status: 'idle', // Set to idle — workers will pick up tasks
            metadata: {
              ...(agent.metadata as Record<string, unknown>),
              activatedAt: new Date().toISOString(),
              activatedDuringOnboarding: true,
            },
            updatedAt: new Date(),
          })
          .where(eq(agents.id, agent.id));
        activated++;
      }
    }

    return {
      activatedAgents: activated,
      totalAgents: tenantAgents.length,
      goLiveTimestamp: new Date().toISOString(),
    };
  }
}
