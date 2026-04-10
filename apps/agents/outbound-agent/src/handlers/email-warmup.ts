import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmOutbound } from '../llm.js';

/**
 * Email Warmup Handler
 *
 * Manages email deliverability via warmup plans:
 * - Calculates sending schedules based on domain age / reputation
 * - Monitors bounce rates, spam placement, inbox rates
 * - Auto-throttles on warning thresholds
 *
 * Ported from: ai-marketing-skills outbound/SKILL.md
 */
export class EmailWarmupHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      domain,
      currentDay = 1,
      dailyVolume = 5,
      bounceRate = 0,
      spamRate = 0,
      inboxRate = 100,
      totalSent = 0,
      reputation = 'unknown',
    } = input;

    // Deterministic warmup schedule calculation
    const WARMUP_RAMP = [5, 8, 12, 18, 25, 35, 50, 65, 80, 100, 130, 160, 200];
    const currentStep = Math.min(currentDay - 1, WARMUP_RAMP.length - 1);
    const recommendedVolume = WARMUP_RAMP[currentStep];

    // Health check thresholds
    const healthIssues: string[] = [];
    let throttle = false;

    if (bounceRate > 5) {
      healthIssues.push(`Bounce rate ${bounceRate}% exceeds 5% threshold`);
      throttle = true;
    }
    if (spamRate > 0.3) {
      healthIssues.push(`Spam rate ${spamRate}% exceeds 0.3% threshold`);
      throttle = true;
    }
    if (inboxRate < 80) {
      healthIssues.push(`Inbox placement ${inboxRate}% below 80% minimum`);
    }

    const adjustedVolume = throttle
      ? Math.max(5, Math.floor(dailyVolume * 0.5))
      : recommendedVolume;

    await job.updateProgress(40);

    // Use LLM for recommendations if there are health issues
    let recommendations: any = null;
    if (healthIssues.length > 0) {
      const prompt = `You are an email deliverability expert. Given these warmup issues, provide actionable recommendations.

DOMAIN: ${domain}
DAY: ${currentDay}
DAILY VOLUME: ${dailyVolume}
BOUNCE RATE: ${bounceRate}%
SPAM RATE: ${spamRate}%
INBOX RATE: ${inboxRate}%
ISSUES: ${JSON.stringify(healthIssues)}

Return JSON:
{
  "diagnosis": string,
  "actions": [{ "priority": 1-5, "action": string, "expectedImpact": string }],
  "dnsChecks": ["SPF" | "DKIM" | "DMARC"],
  "resumeWarmupAfter": string,
  "alternativeStrategy": string | null
}`;

      const raw = await llmOutbound(prompt);
      try {
        recommendations = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      } catch {
        recommendations = { raw };
      }
    }

    await job.updateProgress(80);

    const result = {
      domain,
      day: currentDay,
      currentVolume: dailyVolume,
      recommendedVolume: adjustedVolume,
      nextDayVolume: throttle ? adjustedVolume : WARMUP_RAMP[Math.min(currentStep + 1, WARMUP_RAMP.length - 1)],
      health: {
        bounceRate,
        spamRate,
        inboxRate,
        status: throttle ? 'throttled' : healthIssues.length > 0 ? 'warning' : 'healthy',
        issues: healthIssues,
      },
      totalSent,
      estimatedFullWarmupDays: WARMUP_RAMP.length,
      warmupProgress: Math.round((currentDay / WARMUP_RAMP.length) * 100),
      recommendations,
    };

    if (throttle) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'outbound',
        type: 'outbound.warmup_throttled',
        data: { domain, bounceRate, spamRate, adjustedVolume },
      });
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'email_warmup',
          category: 'deliverability',
          reasoning: `Day ${currentDay} warmup for ${domain}. Volume: ${adjustedVolume}. Status: ${result.health.status}.`,
          trigger: { taskType: 'email_warmup' },
          afterState: { volume: adjustedVolume, status: result.health.status, progress: result.warmupProgress },
          confidence: 0.9,
          impactMetric: 'email_volume',
          impactDelta: adjustedVolume,
        });
      });
    } catch (e) {
      console.warn('Failed to log email warmup:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { warmup: result, completedAt: new Date().toISOString() };
  }
}
