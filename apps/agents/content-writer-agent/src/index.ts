import { ContentWriterWorker } from './worker.js';
import { getDb, tenants, agents } from '@nexuszero/db';
import { initializeOpenTelemetry } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';

async function start() {
  await initializeOpenTelemetry({ serviceName: 'content-writer-agent' });
  const worker = new ContentWriterWorker();

  const db = getDb();
  const activeTenants = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const tenant of activeTenants) {
    const [existing] = await db.select().from(agents)
      .where(and(eq(agents.tenantId, tenant.id), eq(agents.type, 'content-writer')))
      .limit(1);

    if (!existing) {
      await db.insert(agents).values({ tenantId: tenant.id, type: 'content-writer', status: 'idle', metadata: {} });
    }
  }

  await worker.start(activeTenants.map(t => t.id));
  console.log(`Content Writer Agent started for ${activeTenants.length} tenants`);
}

start().catch((err) => {
  console.error('Content Writer Agent failed to start:', err);
  process.exit(1);
});
