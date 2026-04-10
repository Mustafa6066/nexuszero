import { SalesPipelineWorker } from './worker.js';
import { getDb, tenants, agents } from '@nexuszero/db';
import { initializeOpenTelemetry } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';

async function start() {
  await initializeOpenTelemetry({ serviceName: 'sales-pipeline-agent' });
  const worker = new SalesPipelineWorker();

  const db = getDb();
  const activeTenants = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const tenant of activeTenants) {
    const [existing] = await db.select().from(agents)
      .where(and(eq(agents.tenantId, tenant.id), eq(agents.type, 'sales-pipeline')))
      .limit(1);

    if (!existing) {
      await db.insert(agents).values({ tenantId: tenant.id, type: 'sales-pipeline', status: 'idle', metadata: {} });
    }
  }

  await worker.start(activeTenants.map(t => t.id));
  console.log(`Sales Pipeline Agent started for ${activeTenants.length} tenants`);
}

start().catch((err) => {
  console.error('Sales Pipeline Agent failed to start:', err);
  process.exit(1);
});
