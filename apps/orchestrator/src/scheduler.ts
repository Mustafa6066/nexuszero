import { randomUUID } from 'node:crypto';
import cron from 'node-cron';
import { getDb, tenants, campaigns, agents } from '@nexuszero/db';
import { publishAgentTask } from '@nexuszero/queue';
import { eq, and } from 'drizzle-orm';
import { runDailyDigest } from './daily-digest.js';

export class Scheduler {
  private jobs: cron.ScheduledTask[] = [];

  start() {
    const safe = (label: string, fn: () => Promise<void>) => async () => {
      try {
        await fn();
      } catch (err) {
        console.error(JSON.stringify({ level: 'error', msg: `Scheduler job failed: ${label}`, error: (err as Error).message }));
      }
    };

    // SEO audit — every 6 hours
    this.jobs.push(
      cron.schedule('0 */6 * * *', safe('scheduleSeoAudits', () => this.scheduleSeoAudits()), { timezone: 'UTC' }),
    );

    // Ad optimization — every hour
    this.jobs.push(
      cron.schedule('0 * * * *', safe('scheduleAdOptimization', () => this.scheduleAdOptimization()), { timezone: 'UTC' }),
    );

    // Creative fatigue check — every 4 hours
    this.jobs.push(
      cron.schedule('0 */4 * * *', safe('scheduleCreativeFatigueCheck', () => this.scheduleCreativeFatigueCheck()), { timezone: 'UTC' }),
    );

    // AEO citation scan — twice daily
    this.jobs.push(
      cron.schedule('0 8,20 * * *', safe('scheduleAeoCitationScan', () => this.scheduleAeoCitationScan()), { timezone: 'UTC' }),
    );

    // Data analysis & reporting — daily at midnight
    this.jobs.push(
      cron.schedule('0 0 * * *', safe('scheduleDailyAnalysis', () => this.scheduleDailyAnalysis()), { timezone: 'UTC' }),
    );

    // Agent health check — every 2 minutes
    this.jobs.push(
      cron.schedule('*/2 * * * *', safe('checkAgentHealth', () => this.checkAgentHealth()), { timezone: 'UTC' }),
    );

    // Daily Orbit digest — every day at 07:00 UTC
    this.jobs.push(
      cron.schedule('0 7 * * *', safe('dailyOrbitDigest', () => runDailyDigest().then(() => {})), { timezone: 'UTC' }),
    );

    console.log(JSON.stringify({ level: 'info', msg: 'Scheduler started', jobs: 7 }));
  }

  stop() {
    this.jobs.forEach(j => j.stop());
    this.jobs = [];
  }

  private async getActiveTenants() {
    const db = getDb();
    return db.select({ id: tenants.id, plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.status, 'active'));
  }

  private async scheduleSeoAudits() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      await publishAgentTask({
        id: randomUUID(),
        tenantId: tenant.id,
        agentType: 'seo',
        type: 'seo_audit',
        priority: 'low',
        input: { scheduled: true },
      });
    }
    console.log(`Scheduled SEO audits for ${activeTenants.length} tenants`);
  }

  private async scheduleAdOptimization() {
    const activeTenants = await this.getActiveTenants();
    const db = getDb();

    for (const tenant of activeTenants) {
      const activeCampaigns = await db.select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.tenantId, tenant.id), eq(campaigns.status, 'active')));

      for (const campaign of activeCampaigns) {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'ad',
          type: 'optimize_bids',
          priority: 'medium',
          input: { campaignId: campaign.id, scheduled: true },
        });
      }
    }
  }

  private async scheduleCreativeFatigueCheck() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      await publishAgentTask({
        id: randomUUID(),
        tenantId: tenant.id,
        agentType: 'ad',
        type: 'check_fatigue',
        priority: 'medium',
        input: { scheduled: true },
      });
    }
  }

  private async scheduleAeoCitationScan() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      if (tenant.plan === 'growth' || tenant.plan === 'enterprise') {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'aeo',
          type: 'scan_citations',
          priority: 'low',
          input: { scheduled: true },
        });
      }
    }
  }

  private async scheduleDailyAnalysis() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      await publishAgentTask({
        id: randomUUID(),
        tenantId: tenant.id,
        agentType: 'data-nexus',
        type: 'daily_analysis',
        priority: 'low',
        input: { scheduled: true, date: new Date().toISOString().split('T')[0] },
      });
    }
  }

  private async checkAgentHealth() {
    const db = getDb();
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

    const staleAgents = await db.select().from(agents)
      .where(and(
        eq(agents.status, 'processing'),
      ));

    for (const agent of staleAgents) {
      if (agent.lastHeartbeat && new Date(agent.lastHeartbeat) < staleThreshold) {
        console.warn(`Agent ${agent.id} (${agent.type}) appears stale. Last heartbeat: ${agent.lastHeartbeat}`);
        await db.update(agents)
          .set({ status: 'error', updatedAt: new Date() })
          .where(eq(agents.id, agent.id));
      }
    }
  }
}
