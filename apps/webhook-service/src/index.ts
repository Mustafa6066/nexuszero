import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { pathToFileURL } from 'node:url';
import { WebhookWorker } from './worker.js';
import { WebhookDispatcher } from './dispatcher.js';
import { consumeFromKafka } from '@nexuszero/queue';
import { extractTraceContext, initializeOpenTelemetry, initSentry, KAFKA_TOPICS, spanKindForMessagingConsumer, withSpan } from '@nexuszero/shared';

initSentry('webhook-service');

export function createApp() {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'webhook-service' }));

  return app;
}

const app = createApp();
const worker = new WebhookWorker();
const dispatcher = new WebhookDispatcher();
let stopEventConsumer: (() => void) | null = null;

// Start Kafka consumer for webhook events
export function startEventConsumer(eventDispatcher: Pick<WebhookDispatcher, 'dispatchEvent'> = dispatcher) {
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
        await withSpan('kafka.consume.webhook_event', {
          tracerName: 'nexuszero.webhook-service',
          kind: spanKindForMessagingConsumer(),
          parentContext: extractTraceContext(message.traceContext),
          attributes: {
            'messaging.system': 'kafka',
            'messaging.destination.name': KAFKA_TOPICS.EVENTS_WEBHOOK,
            'messaging.kafka.offset': message.offset,
            'nexuszero.tenant.id': String(event.tenantId ?? message.key ?? ''),
          },
        }, async () => eventDispatcher.dispatchEvent(
          String(event.tenantId),
          String(event.type ?? event.eventType),
          (event.data as Record<string, unknown>) || {},
        ));
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

export async function start() {
  await initializeOpenTelemetry({ serviceName: 'webhook-service' });
  // Start BullMQ worker for webhook delivery jobs
  worker.start();

  // Start Kafka consumer for events that trigger webhooks
  stopEventConsumer = startEventConsumer();

  const port = parseInt(process.env.WEBHOOK_SERVICE_PORT || '4003', 10);
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Webhook service running on port ${port}`);
  });
}

export async function run() {
  try {
    await start();
  } catch (err) {
    console.error('Webhook service failed to start:', err);
    process.exit(1);
  }
}

const isMainModule = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMainModule) {
  void run();

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
}
