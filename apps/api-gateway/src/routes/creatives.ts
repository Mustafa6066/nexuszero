import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { withTenantDb, creatives, creativeTests, agentTasks } from '@nexuszero/db';
import { generateCreativeSchema, creativeFiltersSchema, AppError, ERROR_CODES } from '@nexuszero/shared';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and, ilike, sql, desc } from 'drizzle-orm';

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
      throw new AppError('CREATIVE_NOT_FOUND');
    }
    return c.json(creative);
  });
});

// POST /creatives/generate
app.post('/generate', async (c) => {
  const tenantId = c.get('tenantId');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError('INVALID_INPUT', { reason: 'Request body must be valid JSON' });
  }

  const parsed = generateCreativeSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', parsed.error.issues);
  }
  const data = parsed.data;

  // Creative generation is processed by the ad agent's creative engine worker.
  const taskId = randomUUID();

  // Insert a placeholder creative so it appears in the list immediately.
  const [creative] = await withTenantDb(tenantId, async (db) => {
    return db.insert(creatives).values({
      id: taskId,
      tenantId,
      campaignId: data.campaignId ?? null,
      type: data.type,
      name: data.prompt.slice(0, 200),
      status: 'draft',
      content: {},
      generationPrompt: data.prompt,
      generationModel: 'nexuszero-v1',
      variants: [],
      tags: [],
    }).returning();
  });

  // Queue the generation task asynchronously.
  try {
    await publishAgentTask({
      id: taskId,
      tenantId,
      agentType: 'ad',
      type: 'generate_creative',
      priority: 'high',
      input: data,
    });
  } catch {
    // Redis/queue unavailable — persist task directly so it can be picked up later.
    await withTenantDb(tenantId, async (db) => {
      await db.insert(agentTasks).values({
        id: randomUUID(),
        tenantId,
        type: 'generate_creative',
        priority: 'high',
        status: 'pending',
        input: { ...data, creativeId: taskId },
      });
    });
  }

  return c.json(creative, 202);
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
    throw new AppError('VALIDATION_ERROR', { field: 'campaignId', reason: 'campaignId is required' });
  }

  return withTenantDb(tenantId, async (db) => {
    const [test] = await db.insert(creativeTests).values({
      tenantId,
      creativeId,
      campaignId,
    }).returning();

    // Queue the test execution
    try {
      await publishAgentTask({
        id: randomUUID(),
        tenantId,
        agentType: 'ad',
        type: 'run_ab_test',
        priority: 'medium',
        input: { testId: test.id, creativeId, campaignId },
      });
    } catch {
      // Redis unavailable — persist task directly so it can be picked up later.
      await db.insert(agentTasks).values({
        tenantId,
        type: 'run_ab_test',
        priority: 'medium',
        status: 'pending',
        input: { testId: test.id, creativeId, campaignId },
      });
    }

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
      throw new AppError('CREATIVE_NOT_FOUND');
    }
    return c.json({ deleted: true });
  });
});

export { app as creativeRoutes };
