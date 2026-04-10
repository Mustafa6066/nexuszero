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

    // AEO live probe — every 4 hours (growth+ only)
    this.jobs.push(
      cron.schedule('0 */4 * * *', safe('scheduleAeoProbe', () => this.scheduleAeoProbe()), { timezone: 'UTC' }),
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

    // Reddit scan — every hour (growth/enterprise)
    this.jobs.push(
      cron.schedule('0 * * * *', safe('scheduleRedditScan', () => this.scheduleRedditScan()), { timezone: 'UTC' }),
    );

    // Social listening — every 2 hours (growth/enterprise)
    this.jobs.push(
      cron.schedule('0 */2 * * *', safe('scheduleSocialScan', () => this.scheduleSocialScan()), { timezone: 'UTC' }),
    );

    // GEO rank & citation check — every 12 hours (growth/enterprise)
    this.jobs.push(
      cron.schedule('0 */12 * * *', safe('scheduleGeoScan', () => this.scheduleGeoScan()), { timezone: 'UTC' }),
    );

    // Weekly content calendar — Monday 09:00 UTC (enterprise)
    this.jobs.push(
      cron.schedule('0 9 * * 1', safe('scheduleWeeklyContent', () => this.scheduleWeeklyContent()), { timezone: 'UTC' }),
    );

    // ─── Marketing Skills Scheduled Tasks ────────────────────────────

    // Content Attack Brief — weekly (Sunday 22:00 UTC)
    this.jobs.push(
      cron.schedule('0 22 * * 0', safe('scheduleContentAttackBrief', () => this.scheduleContentAttackBrief()), { timezone: 'UTC' }),
    );

    // GSC Optimization — daily at 06:00 UTC
    this.jobs.push(
      cron.schedule('0 6 * * *', safe('scheduleGscOptimization', () => this.scheduleGscOptimization()), { timezone: 'UTC' }),
    );

    // Trend Scouting — Tuesday & Friday 10:00 UTC
    this.jobs.push(
      cron.schedule('0 10 * * 2,5', safe('scheduleTrendScouting', () => this.scheduleTrendScouting()), { timezone: 'UTC' }),
    );

    // Experiment scoring — every 6 hours
    this.jobs.push(
      cron.schedule('0 */6 * * *', safe('scheduleExperimentScoring', () => this.scheduleExperimentScoring()), { timezone: 'UTC' }),
    );

    // Weekly scorecard — Monday 08:00 UTC
    this.jobs.push(
      cron.schedule('0 8 * * 1', safe('scheduleWeeklyScorecard', () => this.scheduleWeeklyScorecard()), { timezone: 'UTC' }),
    );

    // Pacing alerts — daily at 14:00 UTC
    this.jobs.push(
      cron.schedule('0 14 * * *', safe('schedulePacingAlert', () => this.schedulePacingAlert()), { timezone: 'UTC' }),
    );

    // YT Competitive analysis — Sunday 15:00 UTC
    this.jobs.push(
      cron.schedule('0 15 * * 0', safe('scheduleYtCompetitive', () => this.scheduleYtCompetitive()), { timezone: 'UTC' }),
    );

    // CFO Briefing — 1st of month, 09:00 UTC (enterprise)
    this.jobs.push(
      cron.schedule('0 9 1 * *', safe('scheduleCfoBriefing', () => this.scheduleCfoBriefing()), { timezone: 'UTC' }),
    );

    console.log(JSON.stringify({ level: 'info', msg: 'Scheduler started', jobs: 20 }));
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
        agentType: 'creative',
        type: 'fatigue_detection',
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

  private async scheduleAeoProbe() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      if (tenant.plan === 'growth' || tenant.plan === 'enterprise') {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'aeo',
          type: 'aeo_probe',
          priority: 'medium',
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

  private async scheduleRedditScan() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      if (tenant.plan === 'growth' || tenant.plan === 'enterprise') {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'reddit',
          type: 'scan_subreddits',
          priority: 'medium',
          input: { scheduled: true, tenantId: tenant.id },
        });
      }
    }
  }

  private async scheduleSocialScan() {
    const activeTenants = await this.getActiveTenants();
    const platforms = ['twitter', 'hackernews', 'youtube'] as const;
    for (const tenant of activeTenants) {
      if (tenant.plan === 'growth' || tenant.plan === 'enterprise') {
        for (const platform of platforms) {
          await publishAgentTask({
            id: randomUUID(),
            tenantId: tenant.id,
            agentType: 'social',
            type: `scan_${platform}`,
            priority: 'medium',
            input: { scheduled: true, tenantId: tenant.id },
          });
        }
      }
    }
  }

  private async scheduleGeoScan() {
    const activeTenants = await this.getActiveTenants();
    const geoTaskTypes = ['geo_keyword_research', 'geo_citation_audit', 'geo_schema_generate'] as const;
    for (const tenant of activeTenants) {
      if (tenant.plan === 'growth' || tenant.plan === 'enterprise') {
        for (const type of geoTaskTypes) {
          await publishAgentTask({
            id: randomUUID(),
            tenantId: tenant.id,
            agentType: 'geo',
            type,
            priority: 'low',
            input: { scheduled: true, tenantId: tenant.id },
          });
        }
      }
    }
  }

  private async scheduleWeeklyContent() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      if (tenant.plan === 'enterprise') {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'content-writer',
          type: 'write_blog_post',
          priority: 'low',
          input: {
            scheduled: true,
            tenantId: tenant.id,
            brief: { topic: 'weekly industry insights', tone: 'professional', useWebSearch: true },
          },
        });
      }
    }
  }

  // ─── Marketing Skills Scheduled Methods ─────────────────────────

  private async scheduleContentAttackBrief() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      if (tenant.plan === 'growth' || tenant.plan === 'enterprise') {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'seo',
          type: 'content_attack_brief',
          priority: 'medium',
          input: { scheduled: true },
        });
      }
    }
  }

  private async scheduleGscOptimization() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      if (tenant.plan === 'growth' || tenant.plan === 'enterprise') {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'seo',
          type: 'gsc_optimization',
          priority: 'low',
          input: { scheduled: true },
        });
      }
    }
  }

  private async scheduleTrendScouting() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      if (tenant.plan === 'growth' || tenant.plan === 'enterprise') {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'seo',
          type: 'trend_scouting',
          priority: 'medium',
          input: { scheduled: true },
        });
      }
    }
  }

  private async scheduleExperimentScoring() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      await publishAgentTask({
        id: randomUUID(),
        tenantId: tenant.id,
        agentType: 'data-nexus',
        type: 'experiment_score',
        priority: 'medium',
        input: { scheduled: true, action: 'evaluate' },
      });
    }
  }

  private async scheduleWeeklyScorecard() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      await publishAgentTask({
        id: randomUUID(),
        tenantId: tenant.id,
        agentType: 'data-nexus',
        type: 'weekly_scorecard',
        priority: 'medium',
        input: { scheduled: true },
      });
    }
  }

  private async schedulePacingAlert() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      await publishAgentTask({
        id: randomUUID(),
        tenantId: tenant.id,
        agentType: 'data-nexus',
        type: 'pacing_alert',
        priority: 'high',
        input: { scheduled: true },
      });
    }
  }

  private async scheduleYtCompetitive() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      if (tenant.plan === 'growth' || tenant.plan === 'enterprise') {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'social',
          type: 'yt_competitive_analysis',
          priority: 'low',
          input: { scheduled: true },
        });
      }
    }
  }

  private async scheduleCfoBriefing() {
    const activeTenants = await this.getActiveTenants();
    for (const tenant of activeTenants) {
      if (tenant.plan === 'enterprise') {
        await publishAgentTask({
          id: randomUUID(),
          tenantId: tenant.id,
          agentType: 'finance',
          type: 'cfo_briefing',
          priority: 'low',
          input: { scheduled: true, period: 'monthly' },
        });
      }
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
