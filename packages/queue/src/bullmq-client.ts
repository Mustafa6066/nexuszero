import { Queue, Worker, type ConnectionOptions, type QueueOptions, type WorkerOptions } from 'bullmq';
import Redis from 'ioredis';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

// Worker connection — maxRetriesPerRequest: null is REQUIRED by BullMQ workers
let sharedConnection: Redis | null = null;
// Producer connection — fail fast so queue.add() throws quickly if Redis is down
let producerConnection: Redis | null = null;

function isProductionLikeEnvironment(): boolean {
  return process.env['NODE_ENV'] === 'production'
    || Boolean(process.env['RAILWAY_PROJECT_ID'])
    || Boolean(process.env['RAILWAY_SERVICE_ID'])
    || Boolean(process.env['RAILWAY_ENVIRONMENT_NAME']);
}

function resolveRedisUrl(url?: string): string {
  const configuredUrl = url ?? process.env['REDIS_PRIVATE_URL'] ?? process.env['REDIS_URL'];
  if (configuredUrl) {
    return configuredUrl;
  }

  if (isProductionLikeEnvironment()) {
    throw new Error('Redis is not configured. Set REDIS_PRIVATE_URL or REDIS_URL for queue-backed services.');
  }

  return DEFAULT_REDIS_URL;
}

/** Get or create the shared Redis connection used by BullMQ Workers */
export function getRedisConnection(url?: string): Redis {
  if (!sharedConnection) {
    const redisUrl = resolveRedisUrl(url);
    sharedConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ workers
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    sharedConnection.on('error', () => {});
  }
  return sharedConnection;
}

/** Get or create a fail-fast Redis connection for BullMQ Queue producers.
 *  Uses maxRetriesPerRequest: 0 and enableOfflineQueue: false so that
 *  queue.add() throws immediately when Redis is unavailable instead of hanging. */
export function getProducerRedisConnection(url?: string): Redis {
  if (!producerConnection) {
    const redisUrl = resolveRedisUrl(url);
    producerConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      enableReadyCheck: false,
      connectTimeout: 3_000,
      retryStrategy: (times) => (times >= 2 ? null : Math.min(times * 500, 1_000)),
    });
    producerConnection.on('error', () => {});
  }
  return producerConnection;
}

/** Get BullMQ connection options from shared Redis (for workers) */
export function getBullMQConnection(url?: string): ConnectionOptions {
  return getRedisConnection(url) as unknown as ConnectionOptions;
}

/** Create a typed BullMQ queue (uses producer connection — fails fast if Redis is down) */
export function createQueue<T>(
  name: string,
  opts?: Partial<QueueOptions>,
): Queue<T> {
  return new Queue<T>(name, {
    connection: getProducerRedisConnection() as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
    ...opts,
  });
}

/** Create a typed BullMQ worker */
export function createWorker<T>(
  name: string,
  processor: (job: import('bullmq').Job<T>) => Promise<unknown>,
  opts?: Partial<WorkerOptions>,
): Worker<T> {
  return new Worker<T>(name, processor, {
    connection: getBullMQConnection(),
    concurrency: 5,
    ...opts,
  });
}

/** Close all Redis connections (for graceful shutdown) */
export async function closeRedisConnection(): Promise<void> {
  const quits: Promise<unknown>[] = [];
  if (sharedConnection) {
    quits.push(sharedConnection.quit());
    sharedConnection = null;
  }
  if (producerConnection) {
    quits.push(producerConnection.quit());
    producerConnection = null;
  }
  await Promise.allSettled(quits);
}
