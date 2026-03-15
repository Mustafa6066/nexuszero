import { Hono } from 'hono';
import { withTenantDb, cmsChanges } from '@nexuszero/db';
import { AppError, ERROR_CODES } from '@nexuszero/shared';
import { eq, and, desc } from 'drizzle-orm';
import { proposeCmsChange, approveCmsChange, rejectCmsChange } from '@nexuszero/queue';

const app = new Hono();

// GET /cms/changes — list CMS changes for the tenant
app.get('/changes', async (c) => {
  const tenantId = c.get('tenantId');
  const status = c.req.query('status');
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(cmsChanges.tenantId, tenantId)];
    if (status) conditions.push(eq(cmsChanges.status, status as any));

    const result = await db.select().from(cmsChanges)
      .where(and(...conditions))
      .orderBy(desc(cmsChanges.createdAt))
      .limit(limit);
    return c.json(result);
  });
});

// GET /cms/changes/:id — get a specific change
app.get('/changes/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const changeId = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [change] = await db.select().from(cmsChanges)
      .where(and(eq(cmsChanges.id, changeId), eq(cmsChanges.tenantId, tenantId)))
      .limit(1);

    if (!change) {
      throw new AppError(ERROR_CODES.VALIDATION.NOT_FOUND, 'CMS change not found', 404);
    }
    return c.json(change);
  });
});

// POST /cms/changes — propose a new CMS change
app.post('/changes', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  const { integrationId, platform, resourceType, resourceId, scope, afterState, changeDescription } = body;

  if (!integrationId || !platform || !resourceType || !resourceId || !scope || !afterState || !changeDescription) {
    throw new AppError(
      ERROR_CODES.VALIDATION.MISSING_FIELD,
      'integrationId, platform, resourceType, resourceId, scope, afterState, and changeDescription are required',
      400,
    );
  }

  const result = await proposeCmsChange({
    tenantId,
    integrationId,
    platform,
    resourceType,
    resourceId,
    scope,
    proposedBy: 'api',
    beforeState: body.beforeState,
    afterState,
    changeDescription,
  });

  return c.json(result, 201);
});

// POST /cms/changes/:id/approve — approve a pending change
app.post('/changes/:id/approve', async (c) => {
  const tenantId = c.get('tenantId');
  const changeId = c.req.param('id');

  await approveCmsChange(tenantId, changeId, 'user');
  return c.json({ status: 'approved', changeId });
});

// POST /cms/changes/:id/reject — reject a pending change
app.post('/changes/:id/reject', async (c) => {
  const tenantId = c.get('tenantId');
  const changeId = c.req.param('id');

  await rejectCmsChange(tenantId, changeId, 'user');
  return c.json({ status: 'rejected', changeId });
});

export const cmsRoutes = app;
