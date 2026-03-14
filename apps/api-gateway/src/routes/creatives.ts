import { Hono } from 'hono';
import { withTenantDb, creatives, creativeTests } from '@nexuszero/db';
import { generateCreativeSchema, creativeFiltersSchema, AppError, ERROR_CODES } from '@nexuszero/shared';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and, ilike, sql, desc } from 'drizzle-orm';
import { z } from 'zod';

const app = new Hono();

// GET /creatives
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const query = c.req.query();
  const filters = creativeFiltersSchema.parse({
    type: query.type,
    status: query.status,
    campaignId: query.campaignId,
    search: query.search,
    page: query.page ? parseInt(query.page) : undefined,
    limit: query.limit ? parseInt(query.limit) : undefined,
  });

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(creatives.tenantId, tenantId)];
    if (filters.type) conditions.push(eq(creatives.type, filters.type as any));
    if (filters.status) conditions.push(eq(creatives.status, filters.status as any));
    if (filters.campaignId) conditions.push(eq(creatives.campaignId, filters.campaignId));
    if (filters.search) conditions.push(ilike(creatives.name, `%${filters.search}%`));

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const [result, [{ count }]] = await Promise.all([
      db.select().from(creatives).where(and(...conditions)).limit(limit).offset(offset).orderBy(desc(creatives.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(creatives).where(and(...conditions)),
    ]);

    return c.json({ data: result, total: count, page, limit });
  });
});

// GET /creatives/:id
app.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [creative] = await db.select().from(creatives)
      .where(and(eq(creatives.id, id), eq(creatives.tenantId, tenantId)))
      .limit(1);

    if (!creative) {
      throw new AppError(ERROR_CODES.CREATIVE.NOT_FOUND, 'Creative not found', 404);
    }
    return c.json(creative);
  });
});

// POST /creatives/generate
app.post('/generate', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const parsed = generateCreativeSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(ERROR_CODES.VALIDATION.INVALID_INPUT, parsed.error.issues, 400);
  }
  const data = parsed.data;

  // Publish task to Creative Agent
  const taskId = crypto.randomUUID();
  await publishAgentTask({
    id: taskId,
    tenantId,
    agentType: 'creative',
    type: 'generate_creative',
    priority: 'high',
    input: data,
  });

  return c.json({ taskId, status: 'queued', message: 'Creative generation task queued' }, 202);
});

// GET /creatives/:id/tests
app.get('/:id/tests', async (c) => {
  const tenantId = c.get('tenantId');
  const creativeId = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const tests = await db.select().from(creativeTests)
      .where(and(eq(creativeTests.creativeId, creativeId), eq(creativeTests.tenantId, tenantId)))
      .orderBy(desc(creativeTests.createdAt));
    return c.json(tests);
  });
});

// POST /creatives/:id/tests
app.post('/:id/tests', async (c) => {
  const tenantId = c.get('tenantId');
  const creativeId = c.req.param('id');
  const { campaignId } = await c.req.json();

  if (!campaignId) {
    throw new AppError(ERROR_CODES.VALIDATION.MISSING_FIELD, 'campaignId is required', 400);
  }

  return withTenantDb(tenantId, async (db) => {
    const [test] = await db.insert(creativeTests).values({
      tenantId,
      creativeId,
      campaignId,
    }).returning();

    // Queue the test execution
    await publishAgentTask({
      id: crypto.randomUUID(),
      tenantId,
      agentType: 'creative',
      type: 'run_ab_test',
      priority: 'medium',
      input: { testId: test.id, creativeId, campaignId },
    });

    return c.json(test, 201);
  });
});

// DELETE /creatives/:id
app.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [creative] = await db.delete(creatives)
      .where(and(eq(creatives.id, id), eq(creatives.tenantId, tenantId)))
      .returning();

    if (!creative) {
      throw new AppError(ERROR_CODES.CREATIVE.NOT_FOUND, 'Creative not found', 404);
    }
    return c.json({ deleted: true });
  });
});

export { app as creativeRoutes };
