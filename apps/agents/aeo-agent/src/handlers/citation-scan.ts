import type { Job } from 'bullmq';
import { withTenantDb, aeoCitations, entityProfiles, agentActions } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { probeAllQueries, extractCitations } from '@nexuszero/prober';
import type { CitationAnalysis } from '@nexuszero/prober';
import { llmAnalyze } from '../llm.js';
import { publishAgentSignal } from '@nexuszero/queue';
import { insertProbeResult } from '@nexuszero/data-nexus/clickhouse-client';

const AI_PLATFORMS = ['chatgpt', 'perplexity', 'google_ai_overview', 'gemini', 'bing_copilot', 'claude'] as const;

export class CitationScanHandler {
  async execute(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;
    const targetQueries = (input.queries as string[]) || [];
    const providers = (input.providers as string[]) || undefined;

    // 1. Get entity profiles for this tenant
    const entities = await withTenantDb(tenantId, async (db) => {
      return db.select().from(entityProfiles)
        .where(eq(entityProfiles.tenantId, tenantId));
    });

    if (entities.length === 0) {
      return { scanned: 0, message: 'No entity profiles configured. Create entity profiles first.' };
    }

    let totalCitationsFound = 0;
    const results: Array<{ entity: string; citationsFound: number; probeCount: number }> = [];

    for (const entity of entities) {
      // 2. Build query list from entity + explicit queries
      const queries = [
        ...targetQueries,
        `What is ${entity.entityName}?`,
        `${entity.entityName} review`,
        `Best ${entity.entityType} like ${entity.entityName}`,
      ];

      // 3. Build brand context for citation extraction
      const attrs = (entity.attributes as Record<string, unknown>) || {};
      const brandDomains = (attrs.domains as string[]) || [];
      const brandNames = [entity.entityName, ...(attrs.aliases as string[] || [])];
      const competitorDomains = (attrs.competitorDomains as string[]) || [];

      // 4. Probe real LLM APIs
      const probeResults = await probeAllQueries(tenantId, entity.entityName, queries, providers);

      // 5. Extract citations from probe results
      let entityCitations = 0;
      const allAnalyses: CitationAnalysis[] = [];

      for (const probeResult of probeResults) {
        for (const result of probeResult.results) {
          const analysis = extractCitations(result, probeResult.query, brandDomains, brandNames, competitorDomains);
          allAnalyses.push(analysis);

          // Map provider to platform
          const platform = mapProviderToPlatform(result.provider);

          // Store each citation
          for (const citation of analysis.citations) {
            await withTenantDb(tenantId, async (db) => {
              await db.insert(aeoCitations).values({
                tenantId,
                platform: platform || 'chatgpt',
                query: probeResult.query.slice(0, 1000),
                citationUrl: citation.url,
                citationText: citation.context.slice(0, 2000),
                position: analysis.citations.indexOf(citation) + 1,
                isBrandMention: citation.isBrandMention,
                sentiment: analysis.estimatedSentiment,
                competitorsCited: citation.competitorUrls,
              });
            });
            entityCitations++;
          }

          // Store brand-name-only mention (no URL) if applicable
          if (analysis.brandNameMentioned && analysis.citations.length === 0) {
            await withTenantDb(tenantId, async (db) => {
              await db.insert(aeoCitations).values({
                tenantId,
                platform: platform || 'chatgpt',
                query: probeResult.query.slice(0, 1000),
                citationUrl: null,
                citationText: result.responseText.slice(0, 2000),
                position: null,
                isBrandMention: true,
                sentiment: analysis.estimatedSentiment,
                competitorsCited: [],
              });
            });
            entityCitations++;
          }

          // Log to ClickHouse analytics
          try {
            await insertProbeResult({
              tenantId,
              entityName: entity.entityName,
              query: probeResult.query,
              provider: result.provider,
              model: result.model,
              responseText: result.responseText,
              citations: analysis.citations.map(c => c.url),
              brandMentioned: analysis.brandNameMentioned,
              brandCited: analysis.citations.some(c => c.isBrandMention),
              competitorUrls: analysis.citations.flatMap(c => c.competitorUrls),
              sentiment: analysis.estimatedSentiment,
              latencyMs: result.latencyMs,
              tokensUsed: result.tokensUsed,
              cached: probeResult.cached,
            });
          } catch (e) {
            console.warn('Failed to log probe result to ClickHouse:', (e as Error).message);
          }
        }
      }

      totalCitationsFound += entityCitations;
      results.push({
        entity: entity.entityName,
        citationsFound: entityCitations,
        probeCount: probeResults.reduce((sum, r) => sum + r.results.length, 0),
      });

      // 6. Signal probe completed with summary
      const brandMentions = allAnalyses.filter(a => a.brandNameMentioned || a.citations.some(c => c.isBrandMention));
      if (brandMentions.length > 0) {
        await publishAgentSignal({
          tenantId,
          type: 'aeo.probe_completed',
          agentId: 'aeo',
          targetAgent: 'broadcast',
          data: {
            entityName: entity.entityName,
            citationsFound: entityCitations,
            brandMentions: brandMentions.length,
            providers: [...new Set(allAnalyses.map(a => a.provider))],
          },
          priority: 'medium',
          confidence: 0.9,
          correlationId: job.data.correlationId as string,
        });
      }
    }

    // Log agent action for explainability
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'scan_citations',
          category: 'analysis',
          reasoning: `Live-probed ${entities.length} entities across AI platforms. Found ${totalCitationsFound} citations total.`,
          trigger: { taskType: 'scan_citations', entityCount: entities.length },
          afterState: { entitiesScanned: entities.length, totalCitationsFound, results },
          confidence: 0.9,
          impactMetric: 'citations_found',
          impactDelta: totalCitationsFound,
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    return {
      entitiesScanned: entities.length,
      totalCitationsFound,
      results,
    };
  }
}

function mapProviderToPlatform(provider: string): typeof AI_PLATFORMS[number] | null {
  const map: Record<string, typeof AI_PLATFORMS[number]> = {
    openai: 'chatgpt',
    perplexity: 'perplexity',
    gemini: 'gemini',
  };
  return map[provider] || null;
}

function validatePlatform(platform: string): typeof AI_PLATFORMS[number] | null {
  return (AI_PLATFORMS as readonly string[]).includes(platform)
    ? platform as typeof AI_PLATFORMS[number]
    : null;
}
