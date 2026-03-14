import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { withTenantDb, creatives, creativeTests, agentTasks } from '@nexuszero/db';
import { enforceRtlHtmlDocument, generateCreativeSchema, creativeFiltersSchema, resolveMarketContext, AppError } from '@nexuszero/shared';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and, ilike, sql, desc } from 'drizzle-orm';

const app = new Hono();

function truncateName(prompt: string): string {
  const collapsed = prompt.replace(/\s+/g, ' ').trim();
  return (collapsed.slice(0, 200) || 'Untitled Creative');
}

function estimateBrandScore(brandGuidelines: { logoUrl: string | null; doNotUse: string[] }): number {
  let score = 68;
  if (brandGuidelines.logoUrl) score += 8;
  if (brandGuidelines.doNotUse.length > 0) score += 6;
  return Math.min(score, 92);
}

function estimatePredictedCtr(type: string, platform: string): number {
  const baseByType: Record<string, number> = {
    image: 2.1,
    video_script: 1.8,
    ad_copy: 3.2,
    landing_page: 2.7,
    email_template: 4.1,
  };

  let ctr = baseByType[type] ?? 2.0;
  if (/instagram|facebook|linkedin/i.test(platform)) ctr += 0.3;
  if (/search/i.test(platform)) ctr += 0.4;
  if (/email/i.test(platform)) ctr += 0.5;
  return Number(ctr.toFixed(1));
}

function buildFallbackCreativeContent(data: {
  type: string;
  prompt: string;
  platform: string;
  dimensions?: { width: number; height: number; label: string };
  targetAudience: string;
  brandGuidelines: { tone: string; logoUrl: string | null };
  market?: { language?: string; dialect?: 'auto' | 'msa' | 'egyptian' | 'gulf' | 'levantine' | 'maghrebi'; countryCode?: string; region?: string; city?: string; direction?: 'rtl' | 'ltr' };
}) {
  const shortTitle = truncateName(data.prompt).slice(0, 80);
  const market = resolveMarketContext({ ...(data.market ?? {}), prompt: data.prompt, audience: data.targetAudience });

  switch (data.type) {
    case 'image':
      return {
        type: 'image',
        imageUrl: null,
        thumbnailUrl: null,
        dimensions: data.dimensions ?? { width: 1200, height: 628, label: data.platform },
        altText: data.prompt.slice(0, 160),
        overlayText: shortTitle,
        provider: 'dall_e_3',
        direction: market.direction,
      };
    case 'video_script':
      return {
        type: 'video_script',
        script: data.prompt,
        scenes: [
          {
            sceneNumber: 1,
            description: `Hook the audience: ${shortTitle}`,
            durationSeconds: 6,
            visualDirection: 'Fast opening visual with bold on-screen text',
            dialogue: shortTitle,
          },
          {
            sceneNumber: 2,
            description: `Present the core value for ${data.targetAudience}`,
            durationSeconds: 12,
            visualDirection: 'Product-in-context demonstration',
            dialogue: data.prompt,
          },
          {
            sceneNumber: 3,
            description: 'Close with a direct call to action',
            durationSeconds: 6,
            visualDirection: 'Brand lockup and CTA frame',
            dialogue: 'Get started today.',
          },
        ],
        estimatedDurationSeconds: 24,
        voiceoverText: data.prompt,
        musicSuggestion: data.brandGuidelines.tone,
      };
    case 'landing_page':
      return {
        type: 'landing_page',
        html: market.direction === 'rtl'
          ? enforceRtlHtmlDocument(`<!DOCTYPE html><html><head><title>${shortTitle}</title></head><body><main><section><h1>${shortTitle}</h1><p>${data.prompt}</p><a href="#">ابدأ الآن</a></section></main></body></html>`)
          : '',
        css: market.direction === 'rtl' ? 'body{direction:rtl;text-align:right;}' : '',
        headline: shortTitle,
        subheadline: data.prompt.slice(0, 240),
        ctaText: market.direction === 'rtl' ? 'ابدأ الآن' : 'Get Started',
        ctaUrl: '#',
        sections: [
          { type: 'hero', content: shortTitle, order: 1 },
          { type: 'features', content: data.prompt, order: 2 },
          { type: 'cta', content: market.direction === 'rtl' ? 'ابدأ الآن' : 'Get Started', order: 3 },
        ],
      };
    case 'email_template':
      return {
        type: 'email_template',
        subjectLine: shortTitle,
        previewText: data.prompt.slice(0, 120),
        body: data.prompt,
        callToAction: 'Learn more',
      };
    case 'ad_copy':
    default:
      return {
        type: 'ad_copy',
        headline: shortTitle,
        description: data.prompt,
        callToAction: 'Learn more',
        displayUrl: null,
        emotionalArc: 'problem_solution',
        platform: data.platform,
      };
  }
}

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

  const taskId = randomUUID();
  const fallbackContent = buildFallbackCreativeContent(data);
  const fallbackBrandScore = estimateBrandScore(data.brandGuidelines);
  const fallbackPredictedCtr = estimatePredictedCtr(data.type, data.platform);

  const [creative] = await withTenantDb(tenantId, async (db) => {
    return db.insert(creatives).values({
      id: taskId,
      tenantId,
      campaignId: data.campaignId ?? null,
      type: data.type,
      name: truncateName(data.prompt),
      status: 'draft',
      content: fallbackContent,
      generationPrompt: data.prompt,
      generationModel: 'nexuszero-v1',
      brandScore: 0,
      predictedCtr: null,
      variants: [],
      tags: [],
    }).returning();
  });

  try {
    await publishAgentTask({
      id: taskId,
      tenantId,
      agentType: 'ad',
      type: 'generate_creative',
      priority: 'high',
      input: { ...data, creativeId: taskId },
    });
    return c.json(creative, 202);
  } catch {
    const [completedCreative] = await withTenantDb(tenantId, async (db) => {
      const [updatedCreative] = await db.update(creatives)
        .set({
          status: 'generated',
          content: fallbackContent,
          brandScore: fallbackBrandScore,
          predictedCtr: fallbackPredictedCtr,
          generationModel: 'nexuszero-inline-fallback',
          updatedAt: new Date(),
        })
        .where(and(eq(creatives.id, taskId), eq(creatives.tenantId, tenantId)))
        .returning();

      await db.insert(agentTasks).values({
        tenantId,
        type: 'generate_creative',
        priority: 'high',
        status: 'completed',
        input: { ...data, creativeId: taskId },
        output: {
          creativeId: taskId,
          generatedInline: true,
          status: 'generated',
        },
        completedAt: new Date(),
      });

      return [updatedCreative];
    });

    return c.json(completedCreative ?? creative, 201);
  }
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
