import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { promises as dnsPromises } from 'node:dns';
import { Worker, type Job } from 'bullmq';
import { getDb, webhookDeliveries, webhookEndpoints } from '@nexuszero/db';
import { eq, sql } from 'drizzle-orm';
import { QUEUE_NAMES } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import type { WebhookDeliveryPayload } from '@nexuszero/queue';

// ── SSRF protection ──────────────────────────────────────────────────────────

function isPrivateIpAddress(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number) as [number, number];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  const low = ip.toLowerCase();
  if (low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80')) return true;
  return false;
}

async function isSafeWebhookUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  const { hostname } = parsed;
  if (
    hostname === 'localhost' ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) return false;

  if (isIP(hostname)) return !isPrivateIpAddress(hostname);

  try {
    const addresses = await dnsPromises.lookup(hostname, { all: true });
    return addresses.every(({ address }) => !isPrivateIpAddress(address));
  } catch {
    return false;
  }
}


export class WebhookWorker {
  private worker: Worker | null = null;

  start() {
    this.worker = new Worker<WebhookDeliveryPayload>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      async (job) => this.processDelivery(job),
      {
        connection: getRedisConnection(),
        concurrency: 10,
        limiter: {
          max: 50,
          duration: 1000, // 50 deliveries per second globally
        },
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`Webhook delivery ${job.data.deliveryId} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Webhook delivery ${job?.data.deliveryId} failed:`, err.message);
    });

    console.log('Webhook delivery worker started');
  }

  async stop() {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  private async processDelivery(job: Job<WebhookDeliveryPayload>): Promise<void> {
    const { deliveryId, url, secret, payload, eventType, endpointId, tenantId } = job.data;
    const db = getDb();
    const attempt = job.attemptsMade + 1;

    // SSRF guard — validate the stored URL before making any network request
    if (!(await isSafeWebhookUrl(url))) {
      await this.handleFailure(db, deliveryId, endpointId, 0, 'Webhook URL rejected: targets a private or non-HTTPS address', job);
      return;
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signaturePayload = `${timestamp}.${body}`;
    const signature = createHmac('sha256', secret).update(signaturePayload).digest('hex');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-NexusZero-Signature': `t=${timestamp},v1=${signature}`,
      'X-NexusZero-Event': eventType,
      'X-NexusZero-Delivery': deliveryId,
      'User-Agent': 'NexusZero-Webhook/1.0',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      const responseBody = await response.text().catch(() => '');

      if (response.ok) {
        // Success
        await db.update(webhookDeliveries)
          .set({
            status: 'success',
            statusCode: response.status,
            responseBody: responseBody.slice(0, 10_000), // Limit stored response
            attempts: attempt,
            deliveredAt: new Date(),
          })
          .where(eq(webhookDeliveries.id, deliveryId));

        // Reset failure count on endpoint
        await db.update(webhookEndpoints)
          .set({
            failureCount: 0,
            lastSuccessAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(webhookEndpoints.id, endpointId));
      } else {
        // HTTP error
        await this.handleFailure(
          db, deliveryId, endpointId, response.status,
          `HTTP ${response.status}: ${responseBody.slice(0, 500)}`,
          job,
        );
        throw new Error(`Webhook delivery failed with status ${response.status}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        await this.handleFailure(db, deliveryId, endpointId, null, 'Request timeout (15s)', job);
        throw new Error('Webhook delivery timed out');
      }

      // Network error or other
      if (!err.message?.startsWith('Webhook delivery')) {
        await this.handleFailure(db, deliveryId, endpointId, null, err.message, job);
        throw err;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async handleFailure(
    db: ReturnType<typeof getDb>,
    deliveryId: string,
    endpointId: string,
    statusCode: number | null,
    errorMessage: string,
    job: Job<WebhookDeliveryPayload>,
  ) {
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.data.maxRetries || 5;
    const isLastAttempt = attempt >= maxAttempts;

    // Update delivery record
    await db.update(webhookDeliveries)
      .set({
        status: isLastAttempt ? 'failed' : 'retrying',
        statusCode,
        responseBody: errorMessage.slice(0, 10_000),
        attempts: attempt,
        nextRetryAt: isLastAttempt ? null : new Date(Date.now() + this.getBackoffDelay(attempt)),
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    const [endpoint] = await db.update(webhookEndpoints)
      .set({
        failureCount: sql`${webhookEndpoints.failureCount} + 1`,
        lastFailureAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, endpointId))
      .returning({
        failureCount: webhookEndpoints.failureCount,
        status: webhookEndpoints.status,
      });

    if (endpoint && endpoint.failureCount >= 50 && endpoint.status !== 'disabled') {
      await db.update(webhookEndpoints)
        .set({
          status: 'disabled',
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, endpointId));
    }
  }

  /** Exponential backoff: 5s, 25s, 125s, 625s, 3125s */
  private getBackoffDelay(attempt: number): number {
    return Math.min(5000 * Math.pow(5, attempt - 1), 3600_000); // Cap at 1 hour
  }
}
