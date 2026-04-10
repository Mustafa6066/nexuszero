import { getRedisConnection } from '@nexuszero/shared';

/**
 * Redis channel used by the API Gateway's WebSocket bridge.
 * Messages published here are picked up by all gateway instances
 * and broadcast to connected tenant clients.
 */
const WS_BROADCAST_CHANNEL = 'nexuszero:ws:broadcast';

/**
 * Publish a real-time event to WebSocket clients via Redis pub/sub.
 * The API Gateway's ws-bridge subscriber picks these up and broadcasts
 * to all connected clients for the given tenant.
 */
export function publishWsEvent(
  tenantId: string,
  channel: string,
  event: string,
  data: unknown,
): void {
  try {
    const redis = getRedisConnection();
    const message = JSON.stringify({ tenantId, channel, event, data });
    redis.publish(WS_BROADCAST_CHANNEL, message).catch(() => {});
  } catch {
    // Redis not available — silently skip WS broadcast
  }
}
