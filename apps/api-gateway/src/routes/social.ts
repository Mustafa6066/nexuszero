import { Hono } from 'hono';
import { withTenantDb, socialMentions, socialListeningConfig } from '@nexuszero/db';
import { AppError, ERROR_CODES } from '@nexuszero/shared';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and, desc } from 'drizzle-orm';

const app = new Hono();

// GET /social/mentions
app.get('/mentions', async (c) => {
  const tenantId = c.get('tenantId');
  const platform = c.req.query('platform');
  const status = c.req.query('status');
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(socialMentions.tenantId, tenantId)];
    if (platform) conditions.push(eq(socialMentions.platform, platform as 'twitter' | 'hackernews' | 'youtube'));
    if (status) conditions.push(eq(socialMentions.replyStatus, status as 'monitor' | 'draft' | 'approved' | 'posted'));

    const result = await db.select().from(socialMentions)
      .where(and(...conditions))
      .orderBy(desc(socialMentions.detectedAt))
      .limit(limit);
    return c.json(result);
  });
});

// POST /social/mentions/:id/approve
app.post('/mentions/:id/approve', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(socialMentions)
      .set({ replyStatus: 'approved' })
      .where(and(eq(socialMentions.tenantId, tenantId), eq(socialMentions.id, id)))
      .returning();

    if (!updated) throw new AppError(ERROR_CODES.NOT_FOUND, 'Mention not found', 404);
    return c.json({ success: true, mention: updated });
  });
});

// POST /social/scan — trigger all platforms
app.post('/scan', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const platforms = (body.platforms as string[]) ?? ['twitter', 'hackernews', 'youtube'];

  const tasks = platforms.map(platform => publishAgentTask({
    agentType: 'social',
    tenantId,
    type: `scan_${platform}` as 'scan_twitter' | 'scan_hackernews' | 'scan_youtube',
    priority: 'high',
    input: { tenantId },
  }));

  await Promise.all(tasks);
  return c.json({ queued: true, platforms });
});

// GET /social/config
app.get('/config', async (c) => {
  const tenantId = c.get('tenantId');

  return withTenantDb(tenantId, async (db) => {
    const result = await db.select().from(socialListeningConfig)
      .where(eq(socialListeningConfig.tenantId, tenantId));
    return c.json(result);
  });
});

// POST /social/config
app.post('/config', async (c) => {
  const tenantId = c.get('tenantId');
  const { platform, keywords } = await c.req.json();

  if (!platform || !keywords) throw new AppError(ERROR_CODES.VALIDATION.MISSING_FIELD, 'platform and keywords are required', 400);

  return withTenantDb(tenantId, async (db) => {
    const [record] = await db.insert(socialListeningConfig).values({
      tenantId,
      platform,
      keywords,
      isActive: true,
    }).returning();
    return c.json(record, 201);
  });
});

// DELETE /social/config/:id
app.delete('/config/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    await db.delete(socialListeningConfig)
      .where(and(eq(socialListeningConfig.tenantId, tenantId), eq(socialListeningConfig.id, id)));
    return c.json({ success: true });
  });
});

export { app as socialRoutes };
