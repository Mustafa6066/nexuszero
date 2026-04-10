import { initializeOpenTelemetry } from '@nexuszero/shared';
import { withTenantDb, agents, tenants } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { FinanceWorker } from './worker.js';

initializeOpenTelemetry('finance-agent');

async function main() {
  const worker = new FinanceWorker();

  // Auto-create agent records for active tenants
  const { db } = await import('@nexuszero/db');
  const activeTenants = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'active'));

  for (const tenant of activeTenants) {
    try {
      await withTenantDb(tenant.id, async (tdb) => {
        const existing = await tdb
          .select({ id: agents.id })
          .from(agents)
          .where(and(eq(agents.tenantId, tenant.id), eq(agents.agentType, 'finance')))
          .limit(1);
        if (existing.length === 0) {
          await tdb.insert(agents).values({
            tenantId: tenant.id,
            agentType: 'finance',
            name: 'Finance Agent',
            status: 'active',
            configuration: {},
          });
        }
      });
    } catch (e) {
      console.warn(`Failed to create finance agent for tenant ${tenant.id}:`, (e as Error).message);
    }
  }

  await worker.start();
  console.log('[finance-agent] Worker started');
}

main().catch(console.error);
