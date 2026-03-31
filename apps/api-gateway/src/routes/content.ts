import { Hono } from 'hono';
import { withTenantDb, contentDrafts } from '@nexuszero/db';
import { AppError, ERROR_CODES } from '@nexuszero/shared';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and, desc } from 'drizzle-orm';

const app = new Hono();

// GET /content/drafts
app.get('/drafts', async (c) => {
  const tenantId = c.get('tenantId');
  const type = c.req.query('type');
  const status = c.req.query('status');
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));

  return withTenantDb(tenantId, async (db) => {
    const conditions = [eq(contentDrafts.tenantId, tenantId)];
    if (type) conditions.push(eq(contentDrafts.type, type as 'blog_post' | 'social_post' | 'email' | 'landing_page'));
    if (status) conditions.push(eq(contentDrafts.status, status as 'draft' | 'review' | 'approved' | 'published' | 'rejected'));

    const result = await db.select().from(contentDrafts)
      .where(and(...conditions))
      .orderBy(desc(contentDrafts.createdAt))
      .limit(limit);
    return c.json(result);
  });
});

// GET /content/drafts/:id
app.get('/drafts/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [draft] = await db.select().from(contentDrafts)
      .where(and(eq(contentDrafts.tenantId, tenantId), eq(contentDrafts.id, id)))
      .limit(1);

    if (!draft) throw new AppError(ERROR_CODES.NOT_FOUND, 'Draft not found', 404);
    return c.json(draft);
  });
});

// POST /content/generate
app.post('/generate', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const { type, brief, useWebSearch } = body as { type: string; brief: Record<string, unknown>; useWebSearch?: boolean };

  if (!type || !brief) throw new AppError(ERROR_CODES.VALIDATION.MISSING_FIELD, 'type and brief are required', 400);

  const taskTypeMap: Record<string, string> = {
    blog_post: 'write_blog_post',
    social_post: 'write_social_copy',
    email: 'write_email',
  };

  const taskType = taskTypeMap[type];
  if (!taskType) throw new AppError(ERROR_CODES.VALIDATION.INVALID_VALUE, `Unknown content type: ${type}`, 400);

  const taskId = await publishAgentTask({
    agentType: 'content-writer',
    tenantId,
    type: taskType,
    priority: 'medium',
    input: { brief, useWebSearch: useWebSearch ?? false, tenantId },
  });

  return c.json({ queued: true, taskId }, 202);
});

// POST /content/drafts/:id/approve
app.post('/drafts/:id/approve', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(contentDrafts)
      .set({ status: 'approved', approvedAt: new Date() })
      .where(and(eq(contentDrafts.tenantId, tenantId), eq(contentDrafts.id, id)))
      .returning();

    if (!updated) throw new AppError(ERROR_CODES.NOT_FOUND, 'Draft not found', 404);

    // Queue for publishing
    await publishAgentTask({
      agentType: 'content-writer',
      tenantId,
      type: 'publish_content',
      priority: 'medium',
      input: { draftId: id, tenantId },
    });

    return c.json({ success: true, draft: updated });
  });
});

// POST /content/drafts/:id/reject
app.post('/drafts/:id/reject', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const { reason } = await c.req.json().catch(() => ({ reason: '' })) as { reason?: string };

  return withTenantDb(tenantId, async (db) => {
    const [updated] = await db.update(contentDrafts)
      .set({ status: 'rejected', metadata: { rejectionReason: reason } })
      .where(and(eq(contentDrafts.tenantId, tenantId), eq(contentDrafts.id, id)))
      .returning({ id: contentDrafts.id });

    if (!updated) throw new AppError(ERROR_CODES.NOT_FOUND, 'Draft not found', 404);
    return c.json({ success: true });
  });
});

// DELETE /content/drafts/:id
app.delete('/drafts/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');

  return withTenantDb(tenantId, async (db) => {
    await db.delete(contentDrafts)
      .where(and(eq(contentDrafts.tenantId, tenantId), eq(contentDrafts.id, id)));
    return c.json({ success: true });
  });
});

export { app as contentRoutes };
