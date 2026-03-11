import { Hono } from 'hono';
import { withTenantDb, campaigns } from '@nexuszero/db';
import { createCampaignSchema, updateCampaignSchema, campaignFiltersSchema, AppError } from '@nexuszero/shared';
import { eq, and, ilike, sql } from 'drizzle-orm';

const app = new Hono();

// GET /campaigns
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const query = c.req.query();
  const filters = campaignFiltersSchema.parse({
    status: query.status,
    type: query.type,
    platform: query.platform,
    search: query.search,
    page: query.page ? parseInt(query.page) : undefined,
    limit: query.limit ? parseInt(query.limit) : undefined,
  });

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(campaigns.tenantId, tenantId)];
    if (filters.status) conditions.push(eq(campaigns.status, filters.status as any));
    if (filters.type) conditions.push(eq(campaigns.type, filters.type as any));
    if (filters.platform) conditions.push(eq(campaigns.platform, filters.platform as any));
    if (filters.search) conditions.push(ilike(campaigns.name, `%${filters.search}%`));

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const [result, [{ count }]] = await Promise.all([
      db.select().from(campaigns).where(and(...conditions)).limit(limit).offset(offset).orderBy(campaigns.createdAt),
      db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(and(...conditions)),
    ]);

    return c.json({ data: result, total: count, page, limit });
  });
});

// GET /campaigns/:id
app.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
      .limit(1);

    if (!campaign) {
      throw new AppError('CAMPAIGN_NOT_FOUND');
    }
    return c.json(campaign);
  });
});

// POST /campaigns
app.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const data = createCampaignSchema.parse(body);

  return withTenantDb(tenantId, async (db) => {
    const [campaign] = await db.insert(campaigns).values({
      tenantId,
      ...data,
      budget: data.budget as any,
      targeting: data.targeting as any,
      schedule: data.schedule as any,
      config: data.config as any,
    }).returning();

    return c.json(campaign, 201);
  });
});

// PATCH /campaigns/:id
app.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const data = updateCampaignSchema.parse(body);

  return withTenantDb(tenantId, async (db) => {
    const [campaign] = await db.update(campaigns)
      .set({
        ...data,
        ...(data.budget && { budget: data.budget as any }),
        ...(data.targeting && { targeting: data.targeting as any }),
        ...(data.schedule && { schedule: data.schedule as any }),
        ...(data.config && { config: data.config as any }),
        updatedAt: new Date(),
      })
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
      .returning();

    if (!campaign) {
      throw new AppError('CAMPAIGN_NOT_FOUND');
    }
    return c.json(campaign);
  });
});

// DELETE /campaigns/:id
app.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [campaign] = await db.delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
      .returning();

    if (!campaign) {
      throw new AppError('CAMPAIGN_NOT_FOUND');
    }
    return c.json({ deleted: true });
  });
});

export { app as campaignRoutes };
