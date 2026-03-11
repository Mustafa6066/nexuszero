import { AeoWorker } from './worker.js';
import { getDb, tenants, agents } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';

async function start() {
  const worker = new AeoWorker();

  const db = getDb();
  const activeTenants = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const tenant of activeTenants) {
    const [existing] = await db.select().from(agents)
      .where(and(eq(agents.tenantId, tenant.id), eq(agents.type, 'aeo')))
      .limit(1);

    if (!existing) {
      await db.insert(agents).values({
        tenantId: tenant.id,
        type: 'aeo',
        status: 'idle',
        metadata: {},
      });
    }
  }

  await worker.start(activeTenants.map((tenant) => tenant.id));

  console.log(`AEO Agent started for ${activeTenants.length} tenants`);
}

start().catch((err) => {
  console.error('AEO Agent failed to start:', err);
  process.exit(1);
});
