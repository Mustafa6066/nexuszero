import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { WebhookWorker } from './worker.js';
import { WebhookDispatcher } from './dispatcher.js';
import { consumeFromKafka } from '@nexuszero/queue';
import { KAFKA_TOPICS } from '@nexuszero/shared';

const app = new Hono();
const worker = new WebhookWorker();
const dispatcher = new WebhookDispatcher();
let stopEventConsumer: (() => void) | null = null;

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'webhook-service' }));

// Start Kafka consumer for webhook events
function startEventConsumer() {
  const instanceId = process.env.WEBHOOK_SERVICE_INSTANCE_ID || `webhook-${Date.now()}`;
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let failureCount = 0;

  const poll = async () => {
    if (stopped) {
      return;
    }

    try {
      const messages = await consumeFromKafka<Record<string, unknown>>(
        KAFKA_TOPICS.EVENTS_WEBHOOK,
        'webhook-service',
        instanceId,
      );
      failureCount = 0;

      for (const message of messages) {
        const event = message.value;
        await dispatcher.dispatchEvent(
          String(event.tenantId),
          String(event.type ?? event.eventType),
          (event.data as Record<string, unknown>) || {},
        );
      }
    } catch (error) {
      failureCount += 1;
      console.error('Webhook event consumer poll failed:', (error as Error).message);
    } finally {
      const delay = failureCount > 0 ? Math.min(3000 * Math.pow(2, failureCount), 30000) : 3000;
      timeout = setTimeout(() => void poll(), delay);
    }
  };

  void poll();
  console.log('Webhook event consumer started');

  return () => {
    stopped = true;
    if (timeout) {
      clearTimeout(timeout);
    }
  };
}

async function start() {
  // Start BullMQ worker for webhook delivery jobs
  worker.start();

  // Start Kafka consumer for events that trigger webhooks
  stopEventConsumer = startEventConsumer();

  const port = parseInt(process.env.WEBHOOK_SERVICE_PORT || '4003', 10);
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Webhook service running on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Webhook service failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Webhook service shutting down...');
  stopEventConsumer?.();
  await worker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Webhook service shutting down...');
  stopEventConsumer?.();
  await worker.stop();
  process.exit(0);
});
