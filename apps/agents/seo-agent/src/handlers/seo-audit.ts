import type { Job } from 'bullmq';
import { withTenantDb, campaigns } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmAnalyze } from '../llm.js';
import { eq, and } from 'drizzle-orm';

export class SeoAuditHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    // Get active SEO campaigns
    const seoCampaigns = await withTenantDb(tenantId, async (db) => {
      return db.select().from(campaigns)
        .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.type, 'seo'), eq(campaigns.status, 'active')));
    });

    await job.updateProgress(30);

    // Perform LLM-powered SEO audit
    const auditPrompt = `Perform a comprehensive SEO audit for a business with ${seoCampaigns.length} active SEO campaigns.
Campaign data: ${JSON.stringify(seoCampaigns.map(c => ({ name: c.name, config: c.config, metrics: { impressions: c.impressions, clicks: c.clicks, ctr: c.ctr } })))}

Analyze and return JSON with:
{
  "overallScore": number (1-100),
  "onPageScore": number,
  "technicalScore": number,
  "contentScore": number,
  "backlinkScore": number,
  "criticalIssues": [{"issue": string, "impact": string, "fix": string}],
  "opportunities": [{"opportunity": string, "estimatedImpact": string, "effort": string}],
  "keywordGaps": string[],
  "competitorInsights": string[],
  "nextActions": [{"action": string, "priority": "high" | "medium" | "low", "agentType": string}]
}`;

    const analysis = await llmAnalyze(auditPrompt);
    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(analysis.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      result = { raw: analysis, overallScore: 0 };
    }

    // Signal other agents about findings
    if (result.keywordGaps?.length > 0) {
      await publishAgentSignal({
        tenantId,
        agentId: job.data.agentId || 'seo-worker',
        type: 'seo_keywords_updated',
        data: { keywordGaps: result.keywordGaps, source: 'seo_audit' },
      });
    }

    await job.updateProgress(100);
    return { auditResult: result, campaignsAnalyzed: seoCampaigns.length, completedAt: new Date().toISOString() };
  }

  async updateStrategy(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();

    const prompt = `Based on these AEO citation findings, update SEO strategy:
${JSON.stringify(input)}

Return JSON with:
{
  "strategyUpdates": [{"area": string, "currentState": string, "recommendation": string, "priority": string}],
  "contentPriorities": string[],
  "schemaMarkupSuggestions": string[]
}`;

    const result = await llmAnalyze(prompt);
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return { raw: result };
    }
  }
}
