import { Hono } from 'hono';
import { getWsStats } from '../services/websocket.js';

const wsRoutes = new Hono();

/** GET /ws-stats — current WebSocket connection stats (admin only) */
wsRoutes.get('/stats', (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const stats = getWsStats();
  return c.json(stats);
});

export default wsRoutes;
