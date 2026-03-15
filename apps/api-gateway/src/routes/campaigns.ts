import { Hono } from 'hono';
import { withTenantDb, campaigns, campaignVersions } from '@nexuszero/db';
import { createCampaignSchema, updateCampaignSchema, campaignFiltersSchema, AppError } from '@nexuszero/shared';
import { eq, and, ilike, sql, asc, desc, max } from 'drizzle-orm';

const SORT_COLUMNS: Record<string, any> = {
  name: campaigns.name,
  createdAt: campaigns.createdAt,
  updatedAt: campaigns.updatedAt,
  spend: campaigns.spend,
  roas: campaigns.roas,
  // legacy aliases sent by the dashboard
  created_at: campaigns.createdAt,
  updated_at: campaigns.updatedAt,
};

const app = new Hono();

// GET /campaigns
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const query = c.req.query();

  // Normalize sort aliases: the dashboard sends `sort=updated_at` (snake_case)
  const SORT_ALIAS: Record<string, string> = {
    updated_at: 'updatedAt', created_at: 'createdAt',
    name: 'name', spend: 'spend', roas: 'roas',
  };
  const rawSort = query.sortBy ?? query.sort;
  const normalizedSort = rawSort ? (SORT_ALIAS[rawSort] ?? rawSort) : undefined;

  let filters: ReturnType<typeof campaignFiltersSchema.parse>;
  try {
    filters = campaignFiltersSchema.parse({
      status: query.status,
      type: query.type,
      platform: query.platform,
      search: query.search,
      sortBy: normalizedSort,
      sortOrder: query.sortOrder,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
  } catch (err: any) {
    throw new AppError('VALIDATION_ERROR', err?.errors ?? err?.message ?? 'Invalid query parameters');
  }

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(campaigns.tenantId, tenantId)];
    if (filters.status) conditions.push(eq(campaigns.status, filters.status as any));
    if (filters.type) conditions.push(eq(campaigns.type, filters.type as any));
    if (filters.platform) conditions.push(eq(campaigns.platform, filters.platform as any));
    if (filters.search) conditions.push(ilike(campaigns.name, `%${filters.search}%`));

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;
    const sortCol = SORT_COLUMNS[filters.sortBy] ?? campaigns.createdAt;
    const orderFn = filters.sortOrder === 'asc' ? asc : desc;

    const [result, [{ count }]] = await Promise.all([
      db.select().from(campaigns).where(and(...conditions)).limit(limit).offset(offset).orderBy(orderFn(sortCol)),
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
    // Fetch current state for snapshot before updating
    const [current] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
      .limit(1);

    if (!current) {
      throw new AppError('CAMPAIGN_NOT_FOUND');
    }

    // Determine next version number
    const [{ maxVersion }] = await db.select({
      maxVersion: max(campaignVersions.version),
    }).from(campaignVersions)
      .where(and(eq(campaignVersions.campaignId, id), eq(campaignVersions.tenantId, tenantId)));

    const nextVersion = (maxVersion ?? 0) + 1;

    // Snapshot current state before change
    await db.insert(campaignVersions).values({
      tenantId,
      campaignId: id,
      version: nextVersion,
      snapshot: current as any,
      changedBy: 'user',
      changeReason: body.changeReason || 'Manual update',
    });

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

// GET /campaigns/:id/versions — version history
app.get('/:id/versions', async (c) => {
  const tenantId = c.get('tenantId');
  const campaignId = c.req.param('id');
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));

  return withTenantDb(tenantId, async (db) => {
    const versions = await db.select().from(campaignVersions)
      .where(and(
        eq(campaignVersions.campaignId, campaignId),
        eq(campaignVersions.tenantId, tenantId),
      ))
      .orderBy(desc(campaignVersions.version))
      .limit(limit);

    return c.json(versions);
  });
});

// POST /campaigns/:id/rollback/:versionId — restore campaign to a previous version
app.post('/:id/rollback/:versionId', async (c) => {
  const tenantId = c.get('tenantId');
  const campaignId = c.req.param('id');
  const versionId = c.req.param('versionId');
  const user = c.get('user');

  if (user.role !== 'owner' && user.role !== 'admin') {
    throw new AppError('AUTH_INSUFFICIENT_PERMISSIONS');
  }

  return withTenantDb(tenantId, async (db) => {
    // Find the version to rollback to
    const [version] = await db.select().from(campaignVersions)
      .where(and(
        eq(campaignVersions.id, versionId),
        eq(campaignVersions.campaignId, campaignId),
        eq(campaignVersions.tenantId, tenantId),
      ))
      .limit(1);

    if (!version) {
      throw new AppError('VALIDATION_ERROR', { reason: 'Version not found' });
    }

    const snapshot = version.snapshot as Record<string, any>;

    // Snapshot current state before rollback
    const [current] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)))
      .limit(1);

    if (!current) {
      throw new AppError('CAMPAIGN_NOT_FOUND');
    }

    const [{ maxVersion }] = await db.select({
      maxVersion: max(campaignVersions.version),
    }).from(campaignVersions)
      .where(and(eq(campaignVersions.campaignId, campaignId), eq(campaignVersions.tenantId, tenantId)));

    await db.insert(campaignVersions).values({
      tenantId,
      campaignId,
      version: (maxVersion ?? 0) + 1,
      snapshot: current as any,
      changedBy: 'user',
      changeReason: `Rollback to version ${version.version}`,
    });

    // Restore from snapshot
    const [restored] = await db.update(campaigns)
      .set({
        name: snapshot.name,
        status: snapshot.status,
        type: snapshot.type,
        platform: snapshot.platform,
        budget: snapshot.budget,
        targeting: snapshot.targeting,
        schedule: snapshot.schedule,
        config: snapshot.config,
        updatedAt: new Date(),
      })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)))
      .returning();

    return c.json({ restored, fromVersion: version.version });
  });
});

export { app as campaignRoutes };
