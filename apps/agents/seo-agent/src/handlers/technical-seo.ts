import type { Job } from 'bullmq';
import { getCurrentTenantId } from '@nexuszero/shared';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { llmTechnicalAudit } from '../llm.js';
import { renderPage, extractSeoSignals, extractStructuredData } from '@nexuszero/renderer';

export class TechnicalSeoHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { url, pageSpeed, mobileFriendly, issues = [], deep = false } = input;

    let renderedSignals: Record<string, unknown> | null = null;

    // Deep mode: render the page with Playwright to get real signals
    if (deep && url) {
      try {
        const rendered = await renderPage(url, {
          timeout: 20_000,
          waitForNetworkIdle: true,
          blockResources: ['image', 'media'],
        });

        const seoSignals = extractSeoSignals(rendered.html, rendered.finalUrl);
        const structuredData = extractStructuredData(rendered.html);

        renderedSignals = {
          spaDetected: rendered.spaDetected,
          renderTimeMs: rendered.renderTimeMs,
          consoleErrors: rendered.consoleErrors,
          ...seoSignals,
          schemaTypes: structuredData.items.map(i => i.type),
          schemaCount: structuredData.items.length,
        };
      } catch (e) {
        console.warn('Renderer failed, falling back to basic audit:', (e as Error).message);
      }
    }

    await job.updateProgress(30);

    const audit = await llmTechnicalAudit({
      url: url || '',
      pageSpeed,
      mobileFriendly,
      issues,
      market: input.market,
      ...(renderedSignals ? { renderedSignals } : {}),
    });

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: deep ? 'technical_seo_deep' : 'technical_seo_check',
          category: 'analysis',
          reasoning: `Technical SEO audit for ${url || 'unknown URL'}. Deep mode: ${deep}. Issues found: ${issues.length}.${renderedSignals ? ` SPA detected: ${renderedSignals.spaDetected}. Render time: ${renderedSignals.renderTimeMs}ms.` : ''}`,
          trigger: { taskType: deep ? 'technical_seo_deep' : 'technical_seo_check', url, issueCount: issues.length },
          beforeState: { pageSpeed, mobileFriendly, existingIssues: issues.length },
          afterState: { ...audit, renderedSignals: renderedSignals ? { spaDetected: renderedSignals.spaDetected, renderTimeMs: renderedSignals.renderTimeMs } : null },
          confidence: deep ? 0.9 : 0.8,
          impactMetric: 'technical_score',
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    await job.updateProgress(100);

    return {
      technicalAudit: audit,
      renderedSignals,
      url,
      deep,
      completedAt: new Date().toISOString(),
    };
  }
}
