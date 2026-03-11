import { randomUUID } from 'node:crypto';
import { getDb, webhookEndpoints, webhookDeliveries } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { publishWebhookDelivery } from '@nexuszero/queue';

export class WebhookDispatcher {
  /**
   * Called when an event occurs — finds matching webhook endpoints and queues deliveries.
   */
  async dispatchEvent(
    tenantId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const db = getDb();
    const eventPayload = { event: eventType, data, timestamp: new Date().toISOString() };

    // Find active endpoints for this tenant that subscribe to this event type
    const endpoints = await db.select().from(webhookEndpoints)
      .where(and(
        eq(webhookEndpoints.tenantId, tenantId),
        eq(webhookEndpoints.status, 'active'),
      ));

    for (const endpoint of endpoints) {
      const subscribedEvents = Array.isArray(endpoint.events) ? endpoint.events as string[] : [];
      // Check if this endpoint subscribes to this event type
      // Supports wildcards: "*" matches all, "agent.*" matches all agent events
      const matches = subscribedEvents.some(pattern => {
        if (pattern === '*') return true;
        if (pattern.endsWith('.*')) {
          const prefix = pattern.slice(0, -2);
          return eventType.startsWith(prefix + '.');
        }
        return pattern === eventType;
      });

      if (!matches) continue;

      // Create delivery record
      const [delivery] = await db.insert(webhookDeliveries).values({
        tenantId,
        endpointId: endpoint.id,
        eventType,
        payload: eventPayload,
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
      }).returning();

      if (!delivery) {
        throw new Error(`Failed to persist webhook delivery for endpoint ${endpoint.id}`);
      }

      try {
        await publishWebhookDelivery({
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          tenantId,
          eventType,
          payload: eventPayload,
          url: endpoint.url,
          secret: endpoint.secret,
          retryCount: 0,
          maxRetries: 5,
        });
      } catch (error) {
        await db.update(webhookDeliveries)
          .set({
            status: 'failed',
            responseBody: error instanceof Error ? error.message : String(error),
            attempts: 1,
          })
          .where(eq(webhookDeliveries.id, delivery.id));
        throw error;
      }
    }
  }
}
