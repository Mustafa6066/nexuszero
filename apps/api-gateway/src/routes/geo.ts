import { Hono } from 'hono';
import { withTenantDb, geoLocations, geoRankings, geoCitations } from '@nexuszero/db';
import { AppError, ERROR_CODES } from '@nexuszero/shared';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and, desc } from 'drizzle-orm';

const app = new Hono();

// GET /geo/locations
app.get('/locations', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const result = await db.select().from(geoLocations)
      .where(eq(geoLocations.tenantId, tenantId))
      .orderBy(geoLocations.city);
    return c.json(result);
  });
});

// POST /geo/locations
app.post('/locations', async (c) => {
  const tenantId = c.get('tenantId');
  const { name, country, region, city, postalCode, lat, lng } = await c.req.json();

  if (!name || !country || !city) throw new AppError(ERROR_CODES.VALIDATION.MISSING_FIELD, 'name, country, city are required', 400);

  return withTenantDb(tenantId, async (db) => {
    const [record] = await db.insert(geoLocations).values({
      tenantId, name, country, region, city, postalCode, lat, lng, isActive: true,
    }).returning();
    return c.json(record, 201);
  });
});

// PATCH /geo/locations/:id
app.patch('/locations/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json() as Record<string, unknown>;

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(geoLocations)
      .set(body as Partial<typeof geoLocations.$inferInsert>)
      .where(and(eq(geoLocations.tenantId, tenantId), eq(geoLocations.id, id)))
      .returning();

    if (!updated) throw new AppError(ERROR_CODES.NOT_FOUND, 'Location not found', 404);
    return c.json(updated);
  });
});

// DELETE /geo/locations/:id
app.delete('/locations/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    await db.delete(geoLocations)
      .where(and(eq(geoLocations.tenantId, tenantId), eq(geoLocations.id, id)));
    return c.json({ success: true });
  });
});

// GET /geo/rankings
app.get('/rankings', async (c) => {
  const tenantId = c.get('tenantId');
  const locationId = c.req.query('locationId');
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '100', 10)));

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(geoRankings.tenantId, tenantId)];
    if (locationId) conditions.push(eq(geoRankings.locationId, locationId));

    const result = await db.select().from(geoRankings)
      .where(and(...conditions))
      .orderBy(desc(geoRankings.checkedAt))
      .limit(limit);
    return c.json(result);
  });
});

// GET /geo/citations
app.get('/citations', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const result = await db.select().from(geoCitations)
      .where(eq(geoCitations.tenantId, tenantId))
      .orderBy(desc(geoCitations.lastCheckedAt));
    return c.json(result);
  });
});

// POST /geo/scan — manual trigger
app.post('/scan', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({})) as { service?: string };

  const tasks = [
    publishAgentTask({ agentType: 'geo', tenantId, type: 'geo_keyword_research', priority: 'medium', input: { service: body.service ?? '', tenantId } }),
    publishAgentTask({ agentType: 'geo', tenantId, type: 'geo_citation_audit', priority: 'medium', input: { tenantId } }),
    publishAgentTask({ agentType: 'geo', tenantId, type: 'geo_schema_generate', priority: 'low', input: { tenantId } }),
  ];

  await Promise.all(tasks);
  return c.json({ queued: true, tasks: ['geo_keyword_research', 'geo_citation_audit', 'geo_schema_generate'] });
});

export { app as geoRoutes };
