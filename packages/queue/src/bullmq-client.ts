import { Queue, Worker, type ConnectionOptions, type QueueOptions, type WorkerOptions } from 'bullmq';
import Redis from 'ioredis';

let sharedConnection: Redis | null = null;

/** Get or create a shared Redis connection for BullMQ */
export function getRedisConnection(url?: string): Redis {
  if (!sharedConnection) {
    const redisUrl = url ?? process.env['REDIS_PRIVATE_URL'] ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    sharedConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
  }
  return sharedConnection;
}

/** Get BullMQ connection options from shared Redis */
export function getBullMQConnection(url?: string): ConnectionOptions {
  return getRedisConnection(url) as unknown as ConnectionOptions;
}

/** Create a typed BullMQ queue */
export function createQueue<T>(
  name: string,
  opts?: Partial<QueueOptions>,
): Queue<T> {
  return new Queue<T>(name, {
    connection: getBullMQConnection(),
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

/** Close the shared Redis connection (for graceful shutdown) */
export async function closeRedisConnection(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
