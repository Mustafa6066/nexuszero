import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { assistantChatSchema } from '@nexuszero/shared';
import {
  handleAssistantChat,
  getAssistantSessions,
  getSessionMessages,
} from '../services/assistant.service.js';

const app = new Hono();

// POST /assistant/chat — SSE stream
app.post('/chat', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = assistantChatSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', details: parsed.error.issues } }, 400);
  }

  const { message, sessionId, uiContext } = parsed.data;
  const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds as string[] : undefined;

  // Set SSE headers to prevent proxy buffering (Railway, Nginx, Cloudflare)
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return streamSSE(c, async (stream) => {
    try {
      // Send an initial heartbeat comment to flush proxy buffers immediately
      await stream.writeSSE({ event: 'heartbeat', data: '{"type":"heartbeat"}' });

      const generator = handleAssistantChat({
        tenantId,
        userId: user.userId,
        message,
        sessionId,
        uiContext,
        attachmentIds,
      });

      for await (const event of generator) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      }
    } catch (err) {
      console.error('[NexusAI] SSE stream error:', err);
      try {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ type: 'error', message: 'An unexpected error occurred. Please try again.' }),
        });
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ type: 'done' }),
        });
      } catch {
        // Stream already closed — nothing we can do
      }
    }
  });
});

// GET /assistant/sessions — list sessions
app.get('/sessions', async (c) => {
  const tenantId = c.get('tenantId');
  const user = c.get('user');
  const sessions = await getAssistantSessions(tenantId, user.userId);
  return c.json(sessions);
});

// GET /assistant/sessions/:id/messages — list messages
app.get('/sessions/:id/messages', async (c) => {
  const tenantId = c.get('tenantId');
  const sessionId = c.req.param('id');
  const messages = await getSessionMessages(tenantId, sessionId);
  return c.json(messages);
});

export { app as assistantRoutes };
