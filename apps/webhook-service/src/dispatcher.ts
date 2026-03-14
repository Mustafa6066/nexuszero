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
    let queuedCount = 0;
    let failedCount = 0;

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

      let persistedDeliveryId: string | null = null;

      try {
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
          failedCount += 1;
          console.error(`Failed to persist webhook delivery for endpoint ${endpoint.id}`);
          continue;
        }

        persistedDeliveryId = delivery.id;

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
        queuedCount += 1;
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Webhook dispatch failed for endpoint ${endpoint.id}: ${message}`);

        if (persistedDeliveryId) {
          await this.markDeliveryAsFailed(db, persistedDeliveryId, `Queueing failed before delivery worker execution: ${message}`);
        }
      }
    }

    if (failedCount > 0) {
      console.warn(`Webhook dispatch completed with ${queuedCount} queued and ${failedCount} failed deliveries for tenant ${tenantId}`);
    }
  }

  private async markDeliveryAsFailed(
    db: ReturnType<typeof getDb>,
    deliveryId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await db.update(webhookDeliveries)
        .set({
          status: 'failed',
          statusCode: null,
          responseBody: errorMessage.slice(0, 10_000),
          attempts: 0,
          nextRetryAt: null,
          deliveredAt: null,
        })
        .where(eq(webhookDeliveries.id, deliveryId));
    } catch (updateError) {
      console.error(
        `Failed to mark webhook delivery ${deliveryId} as failed: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
      );
    }
  }
}
