import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { TaskRouter } from './task-router.js';
import { TaskGraphExecutor } from './task-graph.js';
import { Scheduler } from './scheduler.js';
import { HealthMonitor } from './health-monitor.js';
import { consumeFromKafka } from '@nexuszero/queue';

const app = new Hono();
const taskRouter = new TaskRouter();
const taskGraphExecutor = new TaskGraphExecutor();
const scheduler = new Scheduler();
const healthMonitor = new HealthMonitor();
let stopConsumers: (() => void) | null = null;

/** Upstash Kafka is pull-based (HTTP REST). Poll each topic on a fixed interval. */
const POLL_INTERVAL_MS = parseInt(process.env.KAFKA_POLL_INTERVAL_MS || '3000', 10);

app.get('/health', (c) => c.json({
  status: 'ok',
  service: 'orchestrator',
  timestamp: new Date().toISOString(),
}));

app.get('/agents/health', async (c) => {
  const status = await healthMonitor.getAllAgentStatus();
  return c.json(status);
});

/**
 * Start polling Kafka topics. Upstash Kafka uses HTTP REST — it is pull-based.
 * consumeFromKafka returns an array of messages; we poll on a fixed interval.
 */
function startConsumers() {
  const instanceId = process.env.ORCHESTRATOR_INSTANCE_ID || `orchestrator-${Date.now()}`;

  const startPollingLoop = <T>(
    topic: string,
    groupId: string,
    label: string,
    handler: (message: T) => Promise<void>,
  ) => {
    let stopped = false;
    let failureCount = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (stopped) {
        return;
      }

      try {
        const messages = await consumeFromKafka<T>(topic, groupId, instanceId);
        failureCount = 0;

        for (const msg of messages) {
          try {
            await handler(msg.value);
          } catch (err) {
            console.error(JSON.stringify({ level: 'error', msg: `Failed to process ${label}`, error: (err as Error).message }));
          }
        }
      } catch (err) {
        failureCount += 1;
        console.error(JSON.stringify({
          level: 'error',
          msg: `Kafka poll error (${label})`,
          error: (err as Error).message,
          retryInMs: Math.min(POLL_INTERVAL_MS * Math.pow(2, failureCount), 30_000),
        }));
      } finally {
        const delay = failureCount > 0
          ? Math.min(POLL_INTERVAL_MS * Math.pow(2, failureCount), 30_000)
          : POLL_INTERVAL_MS;
        timeout = setTimeout(() => void poll(), delay);
      }
    };

    void poll();

    return () => {
      stopped = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  };

  const stops = [
    startPollingLoop('agent-tasks-completed', 'orchestrator-tasks', 'task completion', async (message) => {
      await taskGraphExecutor.onTaskCompleted(message as { taskId: string; tenantId: string; output: unknown; graphId?: string });
    }),
    startPollingLoop('agent-tasks-failed', 'orchestrator-failures', 'task failure', async (message) => {
      await taskRouter.onTaskFailed(message as Parameters<typeof taskRouter.onTaskFailed>[0]);
    }),
    startPollingLoop('agent-signals', 'orchestrator-signals', 'agent signal', async (message) => {
      await taskRouter.onAgentSignal(message as Parameters<typeof taskRouter.onAgentSignal>[0]);
    }),
  ];

  console.log(JSON.stringify({ level: 'info', msg: 'Orchestrator Kafka polling started', intervalMs: POLL_INTERVAL_MS }));
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

async function start() {
  stopConsumers = startConsumers();
  scheduler.start();
  healthMonitor.start();

  const port = parseInt(process.env.ORCHESTRATOR_PORT || process.env.PORT || '4001', 10);
  serve({ fetch: app.fetch, port }, () => {
    console.log(JSON.stringify({ level: 'info', msg: `Orchestrator running`, port }));
  });
}

async function shutdown() {
  stopConsumers?.();
  scheduler.stop();
  healthMonitor.stop();
}

start().catch((err) => {
  console.error('Orchestrator failed to start:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

export default app;
