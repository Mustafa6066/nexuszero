import { AdWorker } from './worker.js';
import { getDb, tenants, agents } from '@nexuszero/db';
import { initializeOpenTelemetry } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';

async function start() {
  await initializeOpenTelemetry({ serviceName: 'ad-agent' });
  const worker = new AdWorker();

  const db = getDb();
  const activeTenants = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const tenant of activeTenants) {
    const [existing] = await db.select().from(agents)
      .where(and(eq(agents.tenantId, tenant.id), eq(agents.type, 'ad')))
      .limit(1);

    if (!existing) {
      await db.insert(agents).values({
        tenantId: tenant.id,
        type: 'ad',
        status: 'idle',
        metadata: {},
      });
    }
  }

  await worker.start(activeTenants.map((tenant) => tenant.id));

  console.log(`Ad Agent started for ${activeTenants.length} tenants`);
}

start().catch((err) => {
  console.error('Ad Agent failed to start:', err);
  process.exit(1);
});
