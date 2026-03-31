import { Hono } from 'hono';
import { withTenantDb, redditMentions, redditMonitoredSubreddits } from '@nexuszero/db';
import { AppError, ERROR_CODES } from '@nexuszero/shared';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and, desc } from 'drizzle-orm';

const app = new Hono();

// GET /reddit/mentions
app.get('/mentions', async (c) => {
  const tenantId = c.get('tenantId');
  const status = c.req.query('status');
  const subreddit = c.req.query('subreddit');
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(redditMentions.tenantId, tenantId)];
    if (status) conditions.push(eq(redditMentions.replyStatus, status as 'pending' | 'approved' | 'posted' | 'dismissed'));
    if (subreddit) conditions.push(eq(redditMentions.subreddit, subreddit));

    const result = await db.select().from(redditMentions)
      .where(and(...conditions))
      .orderBy(desc(redditMentions.detectedAt))
      .limit(limit);
    return c.json(result);
  });
});

// GET /reddit/mentions/:id
app.get('/mentions/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [mention] = await db.select().from(redditMentions)
      .where(and(eq(redditMentions.tenantId, tenantId), eq(redditMentions.id, id)))
      .limit(1);

    if (!mention) throw new AppError(ERROR_CODES.NOT_FOUND, 'Mention not found', 404);
    return c.json(mention);
  });
});

// POST /reddit/mentions/:id/approve
app.post('/mentions/:id/approve', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(redditMentions)
      .set({ replyStatus: 'approved', approvedAt: new Date() })
      .where(and(eq(redditMentions.tenantId, tenantId), eq(redditMentions.id, id)))
      .returning();

    if (!updated) throw new AppError(ERROR_CODES.NOT_FOUND, 'Mention not found', 404);

    await publishAgentTask({
      agentType: 'reddit',
      tenantId,
      type: 'post_reply',
      priority: 'medium',
      input: { mentionId: id, tenantId },
    });

    return c.json({ success: true, mention: updated });
  });
});

// POST /reddit/mentions/:id/dismiss
app.post('/mentions/:id/dismiss', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(redditMentions)
      .set({ replyStatus: 'dismissed' })
      .where(and(eq(redditMentions.tenantId, tenantId), eq(redditMentions.id, id)))
      .returning({ id: redditMentions.id });

    if (!updated) throw new AppError(ERROR_CODES.NOT_FOUND, 'Mention not found', 404);
    return c.json({ success: true });
  });
});

// GET /reddit/subreddits
app.get('/subreddits', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const result = await db.select().from(redditMonitoredSubreddits)
      .where(eq(redditMonitoredSubreddits.tenantId, tenantId))
      .orderBy(redditMonitoredSubreddits.subreddit);
    return c.json(result);
  });
});

// POST /reddit/subreddits
app.post('/subreddits', async (c) => {
  const tenantId = c.get('tenantId');
  const { subreddit, keywords } = await c.req.json();

  if (!subreddit) throw new AppError(ERROR_CODES.VALIDATION.MISSING_FIELD, 'subreddit is required', 400);

  return withTenantDb(tenantId, async (db) => {
    const [record] = await db.insert(redditMonitoredSubreddits).values({
      tenantId,
      subreddit: subreddit.replace(/^r\//, ''),
      keywords: keywords ?? [],
      isActive: true,
    }).returning();
    return c.json(record, 201);
  });
});

// DELETE /reddit/subreddits/:id
app.delete('/subreddits/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    await db.delete(redditMonitoredSubreddits)
      .where(and(eq(redditMonitoredSubreddits.tenantId, tenantId), eq(redditMonitoredSubreddits.id, id)));
    return c.json({ success: true });
  });
});

// POST /reddit/scan — manual trigger
app.post('/scan', async (c) => {
  const tenantId = c.get('tenantId');

  await publishAgentTask({
    agentType: 'reddit',
    tenantId,
    type: 'scan_subreddits',
    priority: 'high',
    input: { tenantId },
  });

  return c.json({ queued: true });
});

export { app as redditRoutes };
