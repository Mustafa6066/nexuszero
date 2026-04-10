import { CreativeWorker } from './worker.js';
import { getDb, tenants, agents } from '@nexuszero/db';
import { initializeOpenTelemetry, createLogger } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';

const log = createLogger('creative-agent');

async function start() {
  await initializeOpenTelemetry({ serviceName: 'creative-agent' });
  const worker = new CreativeWorker();

  const db = getDb();
  const activeTenants = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const tenant of activeTenants) {
    const [existing] = await db.select().from(agents)
      .where(and(eq(agents.tenantId, tenant.id), eq(agents.type, 'creative')))
      .limit(1);

    if (!existing) {
      await db.insert(agents).values({
        tenantId: tenant.id,
        type: 'creative',
        status: 'idle',
        metadata: {},
      });
    }
  }

  await worker.start(activeTenants.map((tenant) => tenant.id));
  log.info('Creative Agent started', { tenantCount: activeTenants.length });
}

start().catch((err) => {
  log.error('Creative Agent failed to start', { error: (err as Error).message });
  process.exit(1);
});
