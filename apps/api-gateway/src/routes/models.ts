import { Hono } from 'hono';
import { withTenantDb, llmModelConfigs } from '@nexuszero/db';
import { AppError, ERROR_CODES } from '@nexuszero/shared';
import { eq, and } from 'drizzle-orm';
import { OPENROUTER_MODELS } from '@nexuszero/llm-router';

const app = new Hono();

// GET /models — list available models
app.get('/', async (c) => {
  const models = Object.entries(OPENROUTER_MODELS).map(([preset, modelId]) => ({
    preset,
    modelId,
    provider: modelId.split('/')[0],
    name: modelId.split('/')[1],
  }));
  return c.json({ models });
});

// GET /models/config — get tenant model configuration
app.get('/config', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const configs = await db.select().from(llmModelConfigs)
      .where(eq(llmModelConfigs.tenantId, tenantId));
    return c.json(configs);
  });
});

// PUT /models/config — update model config (enterprise only)
app.put('/config', async (c) => {
  const tenantId = c.get('tenantId');
  const tier = c.get('tier') as string;

  if (tier !== 'enterprise') {
    throw new AppError(ERROR_CODES.AUTHORIZATION.INSUFFICIENT_PERMISSIONS, 'Model configuration requires enterprise plan', 403);
  }

  const { useCase, primaryModel, fallbackModel, maxTokens, temperature } = await c.req.json();

  if (!useCase || !primaryModel) throw new AppError(ERROR_CODES.VALIDATION.MISSING_FIELD, 'useCase and primaryModel are required', 400);

  return withTenantDb(tenantId, async (db) => {
    // Upsert by useCase
    const [existing] = await db.select({ id: llmModelConfigs.id }).from(llmModelConfigs)
      .where(and(eq(llmModelConfigs.tenantId, tenantId), eq(llmModelConfigs.useCase, useCase)))
      .limit(1);

    let record;
    if (existing) {
      [record] = await db.update(llmModelConfigs)
        .set({ primaryModel, fallbackModel, maxTokens, temperature })
        .where(eq(llmModelConfigs.id, existing.id))
        .returning();
    } else {
      [record] = await db.insert(llmModelConfigs).values({
        tenantId,
        useCase,
        primaryModel,
        fallbackModel: fallbackModel ?? 'anthropic/claude-3-5-haiku',
        maxTokens: maxTokens ?? 4096,
        temperature: temperature ?? 0.7,
      }).returning();
    }

    return c.json(record);
  });
});

export { app as modelRoutes };
