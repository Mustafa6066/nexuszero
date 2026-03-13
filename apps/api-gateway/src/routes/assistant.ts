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

  return streamSSE(c, async (stream) => {
    try {
      const generator = handleAssistantChat({
        tenantId,
        userId: user.userId,
        message,
        sessionId,
        uiContext,
      });

      for await (const event of generator) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      }
    } catch (err) {
      console.error('[NexusAI] SSE stream error:', err);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ type: 'error', message: 'An unexpected error occurred. Please try again.' }),
      });
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ type: 'done' }),
      });
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
