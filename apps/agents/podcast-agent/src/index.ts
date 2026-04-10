import { initializeOpenTelemetry } from '@nexuszero/shared';
import { withTenantDb, agents, tenants } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { PodcastWorker } from './worker.js';

initializeOpenTelemetry('podcast-agent');

async function main() {
  const worker = new PodcastWorker();

  const { db } = await import('@nexuszero/db');
  const activeTenants = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'active'));

  for (const tenant of activeTenants) {
    try {
      await withTenantDb(tenant.id, async (tdb) => {
        const existing = await tdb
          .select({ id: agents.id })
          .from(agents)
          .where(and(eq(agents.tenantId, tenant.id), eq(agents.agentType, 'podcast')))
          .limit(1);
        if (existing.length === 0) {
          await tdb.insert(agents).values({
            tenantId: tenant.id,
            agentType: 'podcast',
            name: 'Podcast Agent',
            status: 'active',
            configuration: {},
          });
        }
      });
    } catch (e) {
      console.warn(`Failed to create podcast agent for tenant ${tenant.id}:`, (e as Error).message);
    }
  }

  await worker.start();
  console.log('[podcast-agent] Worker started');
}

main().catch(console.error);
