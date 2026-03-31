import { Hono } from 'hono';
import { getDb, tenants } from '@nexuszero/db';
import { eq } from 'drizzle-orm';

const app = new Hono();

/**
 * POST /api/v1/billing/stripe-webhook
 *
 * Handles Stripe webhook events:
 * - customer.subscription.updated → sync plan tier
 * - customer.subscription.deleted → downgrade to suspended
 * - invoice.payment_failed → mark as suspended after grace period
 */
app.post('/stripe-webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing stripe-signature header' }, 400);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return c.json({ error: 'Webhook not configured' }, 500);
  }

  // Verify webhook signature using Stripe's recommended approach
  let event: {
    type: string;
    data: { object: Record<string, unknown> };
  };

  try {
    const rawBody = await c.req.text();

    // Stripe signature verification using crypto
    const { createHmac, timingSafeEqual } = await import('node:crypto');
    const elements = signature.split(',');
    const timestamp = elements.find(e => e.startsWith('t='))?.slice(2);
    const sig = elements.find(e => e.startsWith('v1='))?.slice(3);

    if (!timestamp || !sig) {
      return c.json({ error: 'Invalid signature format' }, 400);
    }

    // Reject timestamps older than 5 minutes (replay attack protection)
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (timestampAge > 300) {
      return c.json({ error: 'Webhook timestamp too old' }, 400);
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSig = createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return c.json({ error: 'Invalid signature' }, 400);
    }

    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('Stripe webhook verification failed:', err);
    return c.json({ error: 'Webhook verification failed' }, 400);
  }

  const db = getDb();

  switch (event.type) {
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer as string;
      const status = subscription.status as string;

      // Map Stripe price/product to plan tier
      const planId = (subscription as any).items?.data?.[0]?.price?.lookup_key;
      const planMap: Record<string, string> = {
        launchpad_monthly: 'launchpad',
        launchpad_yearly: 'launchpad',
        growth_monthly: 'growth',
        growth_yearly: 'growth',
        enterprise_monthly: 'enterprise',
        enterprise_yearly: 'enterprise',
      };

      const plan = planMap[planId] ?? undefined;
      const tenantStatus = status === 'active' ? 'active' : status === 'past_due' ? 'active' : 'suspended';

      const updates: Record<string, unknown> = {
        stripeSubscriptionId: subscription.id,
        status: tenantStatus,
        updatedAt: new Date(),
      };
      if (plan) updates.plan = plan;

      await db.update(tenants)
        .set(updates)
        .where(eq(tenants.stripeCustomerId, stripeCustomerId));

      console.log(`Stripe: subscription updated for customer ${stripeCustomerId}, plan=${plan}, status=${tenantStatus}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer as string;

      await db.update(tenants)
        .set({
          status: 'churned',
          plan: 'launchpad',
          updatedAt: new Date(),
        })
        .where(eq(tenants.stripeCustomerId, stripeCustomerId));

      console.log(`Stripe: subscription cancelled for customer ${stripeCustomerId}`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const stripeCustomerId = invoice.customer as string;
      const attemptCount = (invoice as any).attempt_count ?? 0;

      // Suspend after 3 failed payment attempts
      if (attemptCount >= 3) {
        await db.update(tenants)
          .set({ status: 'suspended', updatedAt: new Date() })
          .where(eq(tenants.stripeCustomerId, stripeCustomerId));

        console.log(`Stripe: suspended tenant after ${attemptCount} failed payments, customer ${stripeCustomerId}`);
      }
      break;
    }

    default:
      console.log(`Stripe: unhandled event type ${event.type}`);
  }

  return c.json({ received: true });
});

export { app as billingRoutes };
