import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';

/**
 * Lead Verifier Handler
 *
 * Verifies lead data quality: email validity, domain checks,
 * data enrichment, deduplication.
 *
 * Ported from: ai-marketing-skills outbound/SKILL.md
 */
export class LeadVerifierHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { leads = [] } = input;
    const verified: any[] = [];
    const invalid: any[] = [];
    const duplicates: any[] = [];

    const seenEmails = new Set<string>();

    for (const lead of leads) {
      const email = (lead.email || '').toLowerCase().trim();

      // Duplicate check
      if (seenEmails.has(email)) {
        duplicates.push({ ...lead, reason: 'duplicate_email' });
        continue;
      }
      seenEmails.add(email);

      // Basic email validation
      if (!this.isValidEmail(email)) {
        invalid.push({ ...lead, reason: 'invalid_email_format' });
        continue;
      }

      // Disposable email check
      if (this.isDisposableEmail(email)) {
        invalid.push({ ...lead, reason: 'disposable_email' });
        continue;
      }

      // Role-based check
      const roleBasedWarning = this.isRoleBasedEmail(email);

      verified.push({
        ...lead,
        email,
        verified: true,
        warnings: roleBasedWarning ? ['role_based_email'] : [],
        dataQuality: this.assessDataQuality(lead),
      });
    }

    await job.updateProgress(80);

    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'outbound',
      type: 'outbound.lead_verified',
      data: { verified: verified.length, invalid: invalid.length, duplicates: duplicates.length },
    });

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'lead_verification',
          category: 'hygiene',
          reasoning: `Verified ${verified.length}/${leads.length} leads. Invalid: ${invalid.length}, Duplicates: ${duplicates.length}.`,
          trigger: { taskType: 'lead_verification' },
          afterState: { verified: verified.length, invalid: invalid.length, duplicates: duplicates.length },
          confidence: 0.9,
          impactMetric: 'leads_verified',
          impactDelta: verified.length,
        });
      });
    } catch (e) {
      console.warn('Failed to log verification:', (e as Error).message);
    }

    await job.updateProgress(100);
    return {
      verified,
      invalid,
      duplicates,
      summary: { total: leads.length, verified: verified.length, invalid: invalid.length, duplicates: duplicates.length },
      completedAt: new Date().toISOString(),
    };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  private isDisposableEmail(email: string): boolean {
    const disposable = ['mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email', 'yopmail.com', '10minutemail.com', 'trashmail.com'];
    const domain = email.split('@')[1];
    return disposable.includes(domain);
  }

  private isRoleBasedEmail(email: string): boolean {
    const rolePrefixes = ['info', 'hello', 'contact', 'support', 'admin', 'sales', 'marketing', 'team', 'office', 'hr'];
    const prefix = email.split('@')[0];
    return rolePrefixes.includes(prefix);
  }

  private assessDataQuality(lead: any): number {
    let score = 0;
    if (lead.firstName) score += 15;
    if (lead.lastName) score += 15;
    if (lead.email) score += 20;
    if (lead.company) score += 15;
    if (lead.title) score += 15;
    if (lead.phone) score += 10;
    if (lead.linkedinUrl) score += 10;
    return score;
  }
}
