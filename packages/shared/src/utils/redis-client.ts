// ---------------------------------------------------------------------------
// Shared Redis connection — used by queue, llm-router, and other packages.
// Keeping this in @nexuszero/shared avoids circular dependencies between
// higher-level packages that both need a Redis connection.
// ---------------------------------------------------------------------------

import Redis from 'ioredis';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

let sharedConnection: Redis | null = null;

function isProductionLikeEnvironment(): boolean {
  return process.env['NODE_ENV'] === 'production'
    || Boolean(process.env['RAILWAY_PROJECT_ID'])
    || Boolean(process.env['RAILWAY_SERVICE_ID'])
    || Boolean(process.env['RAILWAY_ENVIRONMENT_NAME']);
}

export function resolveRedisUrl(url?: string): string {
  const configuredUrl = url ?? process.env['REDIS_PRIVATE_URL'] ?? process.env['REDIS_URL'];
  if (configuredUrl) {
    return configuredUrl;
  }

  if (isProductionLikeEnvironment()) {
    throw new Error('Redis is not configured. Set REDIS_PRIVATE_URL or REDIS_URL for queue-backed services.');
  }

  return DEFAULT_REDIS_URL;
}

/** Get or create the shared Redis connection (singleton). */
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
