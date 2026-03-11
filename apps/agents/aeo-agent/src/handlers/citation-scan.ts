import type { Job } from 'bullmq';
import { withTenantDb, aeoCitations, entityProfiles } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { llmAnalyzeCitations } from '../llm.js';
import { publishAgentSignal } from '@nexuszero/queue';

const AI_PLATFORMS = ['chatgpt', 'perplexity', 'google_ai_overview', 'gemini', 'bing_copilot', 'claude'] as const;

export class CitationScanHandler {
  async execute(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;
    const targetQueries = (input.queries as string[]) || [];
    const targetPlatforms = (input.platforms as string[]) || [...AI_PLATFORMS];

    // 1. Get entity profiles for this tenant
    const entities = await withTenantDb(tenantId, async (db) => {
      return db.select().from(entityProfiles)
        .where(eq(entityProfiles.tenantId, tenantId));
    });

    if (entities.length === 0) {
      return { scanned: 0, message: 'No entity profiles configured. Create entity profiles first.' };
    }

    let totalCitationsFound = 0;
    const results: Array<{ entity: string; citationsFound: number }> = [];

    for (const entity of entities) {
      // 2. Build query list from entity + explicit queries
      const queries = [
        ...targetQueries,
        `What is ${entity.entityName}?`,
        `${entity.entityName} review`,
        `Best ${entity.entityType} like ${entity.entityName}`,
      ];

      // 3. Get existing citations for context
      const existingCitations = await withTenantDb(tenantId, async (db) => {
        return db.select().from(aeoCitations)
          .where(eq(aeoCitations.tenantId, tenantId));
      });

      // 4. LLM citation analysis
      const citationResults = await llmAnalyzeCitations({
        entityName: entity.entityName,
        queries,
        existingCitations: existingCitations.map(c => ({
          platform: c.platform,
          query: c.query,
          position: c.position,
          citationText: c.citationText,
        })),
      });

      // 5. Store new citations
      let entityCitations = 0;
      for (const citation of citationResults) {
        const platform = validatePlatform(citation.platform);
        if (!platform) continue;

        await withTenantDb(tenantId, async (db) => {
          await db.insert(aeoCitations).values({
            tenantId,
            platform,
            query: String(citation.query || '').slice(0, 1000),
            citationUrl: citation.citationUrl,
            citationText: citation.citationText,
            position: citation.position,
            isBrandMention: citation.isBrandMention || false,
            sentiment: citation.sentiment,
            competitorsCited: citation.competitorsCited || [],
          });
        });
        entityCitations++;
      }

      totalCitationsFound += entityCitations;
      results.push({ entity: entity.entityName, citationsFound: entityCitations });

      // 6. Signal citation found for each brand mention
      const brandMentions = citationResults.filter(c => c.isBrandMention);
      if (brandMentions.length > 0) {
        await publishAgentSignal({
          tenantId,
          type: 'aeo.citation_found',
          sourceAgent: 'aeo',
          targetAgent: 'broadcast',
          payload: {
            entityName: entity.entityName,
            citationsFound: entityCitations,
            brandMentions: brandMentions.length,
            platforms: [...new Set(brandMentions.map(c => c.platform))],
          },
          priority: 'medium',
          confidence: 0.75,
          correlationId: job.data.correlationId as string,
        });
      }
    }

    return {
      entitiesScanned: entities.length,
      totalCitationsFound,
      results,
    };
  }
}

function validatePlatform(platform: string): typeof AI_PLATFORMS[number] | null {
  return (AI_PLATFORMS as readonly string[]).includes(platform)
    ? platform as typeof AI_PLATFORMS[number]
    : null;
}
