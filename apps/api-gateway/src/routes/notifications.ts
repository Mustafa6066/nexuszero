import { Hono } from 'hono';
import { withTenantDb, notifications } from '@nexuszero/db';
import { AppError } from '@nexuszero/shared';
import { eq, and, desc, sql } from 'drizzle-orm';

const app = new Hono();

// GET /notifications — list notifications with pagination
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
  const unreadOnly = c.req.query('unread') === 'true';

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(notifications.tenantId, tenantId)];
    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    const items = await db.select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(...conditions));

    const [{ unread }] = await db.select({ unread: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)));

    return c.json({ items, total: Number(count), unread: Number(unread), limit, offset });
  });
});

// PATCH /notifications/:id/read — mark a single notification as read
app.patch('/:id/read', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.tenantId, tenantId)))
      .returning({ id: notifications.id });

    if (!updated) {
      throw new AppError('NOT_FOUND', { resource: 'notification' });
    }
    return c.json({ success: true });
  });
});

// POST /notifications/read-all — mark all notifications as read
app.post('/read-all', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const result = await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });

    return c.json({ marked: result.length });
  });
});

export { app as notificationRoutes };
