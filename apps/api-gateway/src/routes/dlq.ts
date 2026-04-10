import { Hono } from 'hono';
import { withTenantDb, deadLetterQueue } from '@nexuszero/db';
import { AppError } from '@nexuszero/shared';
import { eq, and, desc, sql, count } from 'drizzle-orm';

const app = new Hono();

// GET /dlq — paginated list with filters
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const status = c.req.query('status');
  const source = c.req.query('source');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(deadLetterQueue.tenantId, tenantId)];
    if (status) conditions.push(eq(deadLetterQueue.status, status as any));
    if (source) conditions.push(eq(deadLetterQueue.source, source as any));

    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    const [items, [totalRow]] = await Promise.all([
      db.select().from(deadLetterQueue).where(where).orderBy(desc(deadLetterQueue.createdAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(deadLetterQueue).where(where),
    ]);

    return c.json({
      items,
      pagination: { page, limit, total: totalRow?.count ?? 0 },
    });
  });
});

// GET /dlq/stats — summary counts by status
app.get('/stats', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const stats = await db
      .select({
        status: deadLetterQueue.status,
        count: count(),
      })
      .from(deadLetterQueue)
      .where(eq(deadLetterQueue.tenantId, tenantId))
      .groupBy(deadLetterQueue.status);

    const result: Record<string, number> = { pending: 0, retrying: 0, resolved: 0, discarded: 0 };
    for (const row of stats) {
      result[row.status] = row.count;
    }

    return c.json(result);
  });
});

// POST /dlq/:id/retry — mark for retry
app.post('/:id/retry', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [existing] = await db
      .select()
      .from(deadLetterQueue)
      .where(and(eq(deadLetterQueue.id, id), eq(deadLetterQueue.tenantId, tenantId)));

    if (!existing) {
      throw new AppError(3404, 'DLQ entry not found', 404);
    }

    if (existing.status === 'resolved' || existing.status === 'discarded') {
      throw new AppError(3409, `Cannot retry entry with status ${existing.status}`, 409);
    }

    const [updated] = await db
      .update(deadLetterQueue)
      .set({ status: 'retrying', lastAttemptAt: new Date(), attempts: existing.attempts + 1 })
      .where(and(eq(deadLetterQueue.id, id), eq(deadLetterQueue.tenantId, tenantId)))
      .returning();

    return c.json(updated);
  });
});

// POST /dlq/:id/discard — permanently discard
app.post('/:id/discard', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [existing] = await db
      .select()
      .from(deadLetterQueue)
      .where(and(eq(deadLetterQueue.id, id), eq(deadLetterQueue.tenantId, tenantId)));

    if (!existing) {
      throw new AppError(3404, 'DLQ entry not found', 404);
    }

    const [updated] = await db
      .update(deadLetterQueue)
      .set({ status: 'discarded', resolvedAt: new Date() })
      .where(and(eq(deadLetterQueue.id, id), eq(deadLetterQueue.tenantId, tenantId)))
      .returning();

    return c.json(updated);
  });
});

export { app as dlqRoutes };
