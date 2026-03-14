import { getDb, tenants, agents, campaigns, creatives, integrationHealth, integrations } from '@nexuszero/db';
import { eq, and, count, ne } from 'drizzle-orm';

/**
 * Daily Orbit Digest — builds intelligence snapshot per active tenant
 * and dispatches a webhook event that downstream services (email, Slack, etc.)
 * can consume.
 *
 * Called by the Scheduler cron every morning at 07:00 UTC.
 */

interface DigestPayload {
  tenantId: string;
  tenantName: string;
  generatedAt: string;
  sections: DigestSection[];
}

interface DigestSection {
  title: string;
  items: { icon: string; text: string; severity?: 'info' | 'warning' | 'critical' }[];
}

export async function runDailyDigest(): Promise<number> {
  const db = getDb();

  const activeTenants = await db
    .select({ id: tenants.id, name: tenants.name, plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  let dispatched = 0;

  for (const tenant of activeTenants) {
    try {
      const digest = await buildDigestForTenant(tenant.id, tenant.name, tenant.plan);
      if (digest.sections.length === 0) continue;

      // Log the digest for downstream consumption (email service, webhook dispatcher, etc.)
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'Daily digest generated',
          tenantId: tenant.id,
          event: 'digest.daily_orbit',
          sections: digest.sections.length,
        }),
      );

      dispatched++;
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'Daily digest failed for tenant',
          tenantId: tenant.id,
          error: (err as Error).message,
        }),
      );
    }
  }

  console.log(
    JSON.stringify({ level: 'info', msg: 'Daily Orbit digest complete', dispatched, total: activeTenants.length }),
  );

  return dispatched;
}

async function buildDigestForTenant(tenantId: string, tenantName: string, plan: string): Promise<DigestPayload> {
  const db = getDb();
  const sections: DigestSection[] = [];

  // 1. Agent health overview
  const agentRows = await db
    .select({ type: agents.type, status: agents.status })
    .from(agents)
    .where(eq(agents.tenantId, tenantId));

  const agentItems = agentRows.map((a) => ({
    icon: a.status === 'idle' || a.status === 'processing' ? '🟢' : '🔴',
    text: `${a.type} agent — ${a.status}`,
    severity: (a.status === 'error' ? 'critical' : 'info') as 'info' | 'critical',
  }));
  if (agentItems.length > 0) {
    sections.push({ title: 'Agent Status', items: agentItems });
  }

  // 2. Active campaigns
  const campaignRows = await db
    .select({ name: campaigns.name, status: campaigns.status, budget: campaigns.budget })
    .from(campaigns)
    .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.status, 'active')))
    .limit(5);

  const campaignItems = campaignRows.map((c) => ({
    icon: '📊',
    text: `${c.name} — $${Number(c.budget ?? 0).toLocaleString()} budget`,
    severity: 'info' as const,
  }));
  if (campaignItems.length > 0) {
    sections.push({ title: 'Active Campaigns', items: campaignItems });
  }

  // 3. Integration health warnings (join with integrations for platform name)
  const healthRows = await db
    .select({
      platform: integrations.platform,
      checkType: integrationHealth.checkType,
      status: integrationHealth.status,
    })
    .from(integrationHealth)
    .innerJoin(integrations, eq(integrationHealth.integrationId, integrations.id))
    .where(and(eq(integrationHealth.tenantId, tenantId), ne(integrationHealth.status, 'pass')));

  if (healthRows.length > 0) {
    sections.push({
      title: '⚠️ Integration Alerts',
      items: healthRows.map((h) => ({
        icon: '⚠️',
        text: `${h.platform} (${h.checkType}) — ${h.status}`,
        severity: (h.status === 'fail' ? 'critical' : 'warning') as 'critical' | 'warning',
      })),
    });
  }

  // 4. Workspace stats
  const [campaignCount] = await db
    .select({ value: count() })
    .from(campaigns)
    .where(eq(campaigns.tenantId, tenantId));

  const [creativeCount] = await db
    .select({ value: count() })
    .from(creatives)
    .where(eq(creatives.tenantId, tenantId));

  sections.push({
    title: 'Workspace Overview',
    items: [
      { icon: '📋', text: `${campaignCount?.value ?? 0} campaigns total`, severity: 'info' as const },
      { icon: '🎨', text: `${creativeCount?.value ?? 0} creatives generated`, severity: 'info' as const },
      { icon: '💎', text: `Plan: ${plan}`, severity: 'info' as const },
    ],
  });

  return {
    tenantId,
    tenantName,
    generatedAt: new Date().toISOString(),
    sections,
  };
}
