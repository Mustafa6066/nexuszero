import { Hono } from 'hono';
import { withTenantDb, experiments, experimentDataPoints } from '@nexuszero/db';
import { publishAgentTask } from '@nexuszero/queue';
import { AppError } from '@nexuszero/shared';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const createExperimentSchema = z.object({
  name: z.string().min(1).max(200),
  hypothesis: z.string().min(1),
  variants: z.array(z.string()).min(2),
  channel: z.string().optional(),
  targetMetric: z.string().optional(),
});

const app = new Hono();

// GET /experiments — list experiments
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(experiments)
      .where(eq(experiments.tenantId, tenantId))
      .orderBy(desc(experiments.createdAt))
      .limit(50);
    return c.json(results);
  });
});

// POST /experiments — create experiment via agent
app.post('/', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({}));
  const parsed = createExperimentSchema.safeParse(body);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', parsed.error.issues);

  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId,
    tenantId,
    agentType: 'data-nexus',
    type: 'experiment_create',
    priority: 'medium',
    input: { action: 'create', ...parsed.data },
  });

  return c.json({ taskId, status: 'queued' }, 202);
});

// POST /experiments/:id/score — trigger experiment scoring
app.post('/:id/score', async (c) => {
  const tenantId = c.get('tenantId');
  const experimentId = c.req.param('id');
  const taskId = randomUUID();

  await publishAgentTask({
    id: taskId,
    tenantId,
    agentType: 'data-nexus',
    type: 'experiment_score',
    priority: 'medium',
    input: { action: 'evaluate', experimentId },
  });

  return c.json({ taskId, status: 'queued' }, 202);
});

// GET /experiments/:id/data — get experiment data points
app.get('/:id/data', async (c) => {
  const tenantId = c.get('tenantId');
  const experimentId = c.req.param('id');
  return withTenantDb(tenantId, async (db) => {
    const results = await db.select().from(experimentDataPoints)
      .where(eq(experimentDataPoints.experimentId, experimentId))
      .orderBy(desc(experimentDataPoints.recordedAt));
    return c.json(results);
  });
});

// POST /experiments/scorecard — trigger weekly scorecard
app.post('/scorecard', async (c) => {
  const tenantId = c.get('tenantId');
  const taskId = randomUUID();
  await publishAgentTask({
    id: taskId,
    tenantId,
    agentType: 'data-nexus',
    type: 'weekly_scorecard',
    priority: 'medium',
    input: {},
  });
  return c.json({ taskId, status: 'queued' }, 202);
});

export { app as experimentRoutes };
