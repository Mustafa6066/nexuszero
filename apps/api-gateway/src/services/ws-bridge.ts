import Redis from 'ioredis';
import { broadcastToTenant, type WsMessage } from './websocket.js';

// ---------------------------------------------------------------------------
// Redis Pub/Sub bridge for multi-instance WebSocket broadcasting.
//
// When a backend service (orchestrator, agent worker, etc.) publishes a
// real-time event, it goes through Redis pub/sub so ALL api-gateway instances
// push the message to their connected clients.
// ---------------------------------------------------------------------------

const WS_CHANNEL = 'nexuszero:ws:broadcast';

let pub: Redis | null = null;
let sub: Redis | null = null;

/**
 * Initialise the Redis pub/sub bridge.
 * Call once at server startup.
 */
export function initWsBridge(redisUrl?: string): void {
  const url = redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';

  pub = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  sub = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });

  pub.connect().catch(() => {});
  sub.connect().catch(() => {});

  sub.subscribe(WS_CHANNEL).catch(() => {});

  sub.on('message', (_channel, rawMessage) => {
    try {
      const msg = JSON.parse(rawMessage) as {
        tenantId: string;
        channel: string;
        event: string;
        data: unknown;
      };
      // Deliver to local WebSocket clients
      broadcastToTenant(msg.tenantId, msg.channel, msg.event, msg.data);
    } catch {
      // Malformed message — skip
    }
  });
}

/**
 * Publish a real-time event via Redis so all gateway instances broadcast it.
 * This is the primary entry point for backend services to push events.
 */
export function publishWsEvent(
  tenantId: string,
  channel: string,
  event: string,
  data: unknown,
): void {
  if (!pub) return;

  const message = JSON.stringify({ tenantId, channel, event, data });
  pub.publish(WS_CHANNEL, message).catch(() => {});
}

/** Clean shutdown of Redis connections */
export async function closeWsBridge(): Promise<void> {
  if (sub) {
    await sub.unsubscribe(WS_CHANNEL).catch(() => {});
    sub.disconnect();
    sub = null;
  }
  if (pub) {
    pub.disconnect();
    pub = null;
  }
}
