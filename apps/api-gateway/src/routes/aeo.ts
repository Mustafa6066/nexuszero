import { Hono } from 'hono';
import { withTenantDb, aeoCitations, entityProfiles, aiVisibilityScores } from '@nexuszero/db';
import { AppError, ERROR_CODES } from '@nexuszero/shared';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and, desc, sql } from 'drizzle-orm';

const app = new Hono();

// GET /aeo/citations
app.get('/citations', async (c) => {
  const tenantId = c.get('tenantId');
  const platform = c.req.query('platform');
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(aeoCitations.tenantId, tenantId)];
    if (platform) conditions.push(eq(aeoCitations.platform, platform as any));

    const result = await db.select().from(aeoCitations)
      .where(and(...conditions))
      .orderBy(desc(aeoCitations.discoveredAt))
      .limit(limit);
    return c.json(result);
  });
});

// GET /aeo/entities
app.get('/entities', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const result = await db.select().from(entityProfiles)
      .where(eq(entityProfiles.tenantId, tenantId))
      .orderBy(entityProfiles.entityName);
    return c.json(result);
  });
});

// POST /aeo/entities
app.post('/entities', async (c) => {
  const tenantId = c.get('tenantId');
  const { entityName, entityType, description, attributes } = await c.req.json();

  if (!entityName || !entityType) {
    throw new AppError(ERROR_CODES.VALIDATION.MISSING_FIELD, 'entityName and entityType are required', 400);
  }

  return withTenantDb(tenantId, async (db) => {
    const [entity] = await db.insert(entityProfiles).values({
      tenantId,
      entityName,
      entityType,
      description,
      attributes,
    }).returning();

    return c.json(entity, 201);
  });
});

// GET /aeo/visibility
app.get('/visibility', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const result = await db.select().from(aiVisibilityScores)
      .where(eq(aiVisibilityScores.tenantId, tenantId))
      .orderBy(desc(aiVisibilityScores.measuredAt));
    return c.json(result);
  });
});

// POST /aeo/scan
app.post('/scan', async (c) => {
  const tenantId = c.get('tenantId');
  const { queries, platforms } = await c.req.json();

  const taskId = crypto.randomUUID();
  await publishAgentTask({
    id: taskId,
    tenantId,
    agentType: 'aeo',
    type: 'scan_citations',
    priority: 'medium',
    input: { queries, platforms },
  });

  return c.json({ taskId, status: 'queued', message: 'AEO scan task queued' }, 202);
});

// POST /aeo/optimize-schema
app.post('/optimize-schema', async (c) => {
  const tenantId = c.get('tenantId');
  const { entityId, targetPlatforms } = await c.req.json();

  if (!entityId) {
    throw new AppError(ERROR_CODES.VALIDATION.MISSING_FIELD, 'entityId is required', 400);
  }

  const taskId = crypto.randomUUID();
  await publishAgentTask({
    id: taskId,
    tenantId,
    agentType: 'aeo',
    type: 'optimize_schema',
    priority: 'medium',
    input: { entityId, targetPlatforms },
  });

  return c.json({ taskId, status: 'queued', message: 'Schema optimization task queued' }, 202);
});

export { app as aeoRoutes };
