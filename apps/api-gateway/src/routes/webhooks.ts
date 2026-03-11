import { Hono } from 'hono';
import { withTenantDb, webhookEndpoints, webhookDeliveries } from '@nexuszero/db';
import { createWebhookSchema, AppError, isValidWebhookUrl, generateWebhookSecret } from '@nexuszero/shared';
import { eq, and, desc, sql } from 'drizzle-orm';

const app = new Hono();

// GET /webhooks
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const result = await db.select().from(webhookEndpoints)
      .where(eq(webhookEndpoints.tenantId, tenantId))
      .orderBy(desc(webhookEndpoints.createdAt));
    return c.json(result);
  });
});

// POST /webhooks
app.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const data = createWebhookSchema.parse(body);

  if (!isValidWebhookUrl(data.url)) {
    throw new AppError('WEBHOOK_INVALID_URL');
  }

  const secret = generateWebhookSecret();

  return withTenantDb(tenantId, async (db) => {
    const [webhook] = await db.insert(webhookEndpoints).values({
      tenantId,
      url: data.url,
      secret,
      events: data.events,
      description: data.description,
    }).returning();

    return c.json({ ...webhook, secret }, 201);
  });
});

// PATCH /webhooks/:id
app.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const { url, events, status, description } = body;

  if (url && !isValidWebhookUrl(url)) {
    throw new AppError('WEBHOOK_INVALID_URL');
  }

  return withTenantDb(tenantId, async (db) => {
    const [webhook] = await db.update(webhookEndpoints)
      .set({
        ...(url && { url }),
        ...(events && { events }),
        ...(status && { status }),
        ...(description !== undefined && { description }),
        updatedAt: new Date(),
      })
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, tenantId)))
      .returning();

    if (!webhook) {
      throw new AppError('WEBHOOK_NOT_FOUND');
    }
    return c.json(webhook);
  });
});

// DELETE /webhooks/:id
app.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [webhook] = await db.delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, tenantId)))
      .returning();

    if (!webhook) {
      throw new AppError('WEBHOOK_NOT_FOUND');
    }
    return c.json({ deleted: true });
  });
});

// GET /webhooks/:id/deliveries
app.get('/:id/deliveries', async (c) => {
  const tenantId = c.get('tenantId');
  const endpointId = c.req.param('id');
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));

  return withTenantDb(tenantId, async (db) => {
    const deliveries = await db.select().from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.tenantId, tenantId)))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
    return c.json(deliveries);
  });
});

export { app as webhookRoutes };
