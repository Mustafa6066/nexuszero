import { Hono } from 'hono';
import { recallMemories, getMemoryStats, pruneMemories } from '@nexuszero/queue';

const agentMemoryRoutes = new Hono();

/** GET /memories — recall agent memories for the tenant */
agentMemoryRoutes.get('/memories', async (c) => {
  const user = c.get('user');
  const agentType = c.req.query('agentType');
  const category = c.req.query('category');
  const limit = parseInt(c.req.query('limit') ?? '20', 10);
  const maxAgeDays = c.req.query('maxAgeDays') ? parseInt(c.req.query('maxAgeDays')!, 10) : undefined;
  const minReliability = c.req.query('minReliability') ? parseFloat(c.req.query('minReliability')!) : undefined;

  const memories = await recallMemories({
    tenantId: user.tenantId,
    agentType: agentType || undefined,
    category: category || undefined,
    limit: Math.min(limit, 100),
    maxAgeDays,
    minReliability,
  });

  return c.json({ memories, count: memories.length });
});

/** GET /stats — memory stats per agent type */
agentMemoryRoutes.get('/stats', async (c) => {
  const user = c.get('user');
  const stats = await getMemoryStats(user.tenantId);
  return c.json(stats);
});

/** POST /prune — prune old/low-reliability memories (admin only) */
agentMemoryRoutes.post('/prune', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const pruned = await pruneMemories(user.tenantId, {
    maxAge: body.maxAgeDays,
    minReliability: body.minReliability,
  });

  return c.json({ pruned });
});

export default agentMemoryRoutes;
