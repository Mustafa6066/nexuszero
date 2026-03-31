import { RedditWorker } from './worker.js';
import { getDb, tenants, agents } from '@nexuszero/db';
import { initializeOpenTelemetry } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';

async function start() {
  await initializeOpenTelemetry({ serviceName: 'reddit-agent' });
  const worker = new RedditWorker();

  const db = getDb();
  const activeTenants = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const tenant of activeTenants) {
    const [existing] = await db.select().from(agents)
      .where(and(eq(agents.tenantId, tenant.id), eq(agents.type, 'reddit')))
      .limit(1);

    if (!existing) {
      await db.insert(agents).values({
        tenantId: tenant.id,
        type: 'reddit',
        status: 'idle',
        metadata: {},
      });
    }
  }

  await worker.start(activeTenants.map((tenant) => tenant.id));
  console.log(`Reddit Agent started for ${activeTenants.length} tenants`);
}

start().catch((err) => {
  console.error('Reddit Agent failed to start:', err);
  process.exit(1);
});
