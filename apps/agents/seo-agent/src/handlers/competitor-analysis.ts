import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { publishAgentSignal } from '@nexuszero/queue';
import { renderPage, extractSeoSignals, extractStructuredData } from '@nexuszero/renderer';
import { llmAnalyze } from '../llm.js';

export class CompetitorAnalysisHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      competitorUrls = [],
      ownUrl = '',
      targetKeywords = [],
    } = input;

    if (!competitorUrls.length) {
      return { error: 'No competitor URLs provided' };
    }

    await job.updateProgress(20);

    // Render and extract signals from each competitor
    const competitorData: Array<{
      url: string;
      seoSignals: any;
      structuredData: any;
      renderTimeMs: number;
      spaDetected: boolean;
    }> = [];

    for (const url of competitorUrls.slice(0, 5)) {
      try {
        const rendered = await renderPage(url, {
          timeout: 20_000,
          blockResources: ['image', 'media', 'font'],
        });

        const seoSignals = extractSeoSignals(rendered.html, rendered.finalUrl);
        const structuredData = extractStructuredData(rendered.html);

        competitorData.push({
          url: rendered.finalUrl,
          seoSignals,
          structuredData,
          renderTimeMs: rendered.renderTimeMs,
          spaDetected: rendered.spaDetected,
        });
      } catch (e) {
        console.warn(`Failed to render competitor ${url}:`, (e as Error).message);
        competitorData.push({
          url,
          seoSignals: null,
          structuredData: null,
          renderTimeMs: 0,
          spaDetected: false,
        });
      }
    }

    await job.updateProgress(60);

    // LLM comparative analysis
    const analysisPrompt = `Analyze competitor SEO data and provide actionable insights.

Own URL: ${ownUrl}
Target Keywords: ${targetKeywords.join(', ')}

Competitor Data:
${competitorData.map(c => `
URL: ${c.url}
Title: ${c.seoSignals?.title || 'N/A'}
Meta Description: ${c.seoSignals?.metaDescription || 'N/A'}
H1: ${c.seoSignals?.h1 || 'N/A'}
Heading Count: ${c.seoSignals?.headingCount || 0}
Internal Links: ${c.seoSignals?.internalLinkCount || 0}
External Links: ${c.seoSignals?.externalLinkCount || 0}
Schema Types: ${c.structuredData?.items?.map((i: any) => i.type).join(', ') || 'none'}
SPA: ${c.spaDetected}
`).join('\n---\n')}

Return JSON:
{
  "competitorRankings": [{"url": string, "strengthScore": number, "weaknesses": string[]}],
  "gaps": [{"area": string, "yourStatus": string, "competitorStatus": string, "opportunity": string}],
  "contentGaps": string[],
  "schemaOpportunities": string[],
  "recommendations": [{"action": string, "priority": "high"|"medium"|"low", "estimatedImpact": string}]
}`;

    const analysis = await llmAnalyze(analysisPrompt);
    await job.updateProgress(90);

    let result: any;
    try {
      result = JSON.parse(analysis.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      result = { raw: analysis };
    }

    // Signal other agents
    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'seo-agent',
      type: 'seo.competitor_analyzed',
      data: {
        competitorCount: competitorData.length,
        contentGaps: result.contentGaps || [],
        schemaOpportunities: result.schemaOpportunities || [],
      },
      priority: 'medium',
      confidence: 0.7,
    });

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'competitor_analysis',
          category: 'analysis',
          reasoning: `Analyzed ${competitorData.length} competitor URLs against ${targetKeywords.length} target keywords.`,
          trigger: { taskType: 'competitor_analysis', competitorCount: competitorData.length },
          beforeState: { competitorUrls },
          afterState: { gapCount: result.gaps?.length || 0, recommendationCount: result.recommendations?.length || 0 },
          confidence: 0.7,
          impactMetric: 'competitive_positioning',
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);

    return {
      competitorData: competitorData.map(c => ({
        url: c.url,
        spaDetected: c.spaDetected,
        hasSchema: !!c.structuredData?.items?.length,
      })),
      analysis: result,
      completedAt: new Date().toISOString(),
    };
  }
}
