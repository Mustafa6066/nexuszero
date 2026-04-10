import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmAnalyzeSales } from '../llm.js';

/**
 * Lead Suppressor Handler
 *
 * Identifies leads that should be suppressed from outreach:
 * existing customers, competitors, spam, blacklisted domains.
 *
 * Ported from: ai-marketing-skills sales-pipeline/SKILL.md
 */
export class LeadSuppressorHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      leads = [],
      existingCustomers = [],
      competitors = [],
      blacklistedDomains = [],
    } = input;

    const existingDomains = new Set(existingCustomers.map((c: any) => this.extractDomain(c.email || c.domain || '')));
    const competitorDomains = new Set(competitors.map((c: any) => this.extractDomain(c.domain || '')));
    const blacklisted = new Set(blacklistedDomains.map((d: string) => d.toLowerCase()));

    const suppressed: any[] = [];
    const passed: any[] = [];

    for (const lead of leads) {
      const domain = this.extractDomain(lead.email || lead.domain || '');
      let suppressReason: string | null = null;

      if (existingDomains.has(domain)) {
        suppressReason = 'existing_customer';
      } else if (competitorDomains.has(domain)) {
        suppressReason = 'competitor';
      } else if (blacklisted.has(domain)) {
        suppressReason = 'blacklisted';
      } else if (this.isGenericEmail(lead.email)) {
        suppressReason = 'generic_email';
      }

      if (suppressReason) {
        suppressed.push({ ...lead, suppressReason });
      } else {
        passed.push(lead);
      }
    }

    await job.updateProgress(80);

    if (suppressed.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'sales-pipeline',
        type: 'sales.lead_suppressed',
        data: { suppressedCount: suppressed.length, reasons: this.countReasons(suppressed) },
      });
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'lead_suppression',
          category: 'hygiene',
          reasoning: `Suppressed ${suppressed.length}/${leads.length} leads. Passed: ${passed.length}.`,
          trigger: { taskType: 'lead_suppression' },
          afterState: { suppressed: suppressed.length, passed: passed.length, reasons: this.countReasons(suppressed) },
          confidence: 0.95,
          impactMetric: 'leads_suppressed',
          impactDelta: suppressed.length,
        });
      });
    } catch (e) {
      console.warn('Failed to log suppression:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { passed, suppressed, summary: { total: leads.length, suppressed: suppressed.length, passed: passed.length }, completedAt: new Date().toISOString() };
  }

  private extractDomain(input: string): string {
    if (input.includes('@')) return input.split('@')[1].toLowerCase();
    return input.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  }

  private isGenericEmail(email?: string): boolean {
    if (!email) return false;
    const genericPrefixes = ['info', 'hello', 'contact', 'support', 'admin', 'sales', 'noreply', 'no-reply', 'webmaster'];
    const prefix = email.split('@')[0].toLowerCase();
    return genericPrefixes.includes(prefix);
  }

  private countReasons(suppressed: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const s of suppressed) {
      counts[s.suppressReason] = (counts[s.suppressReason] || 0) + 1;
    }
    return counts;
  }
}
