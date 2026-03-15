import type { Job } from 'bullmq';
import { withTenantDb, entityProfiles, agentActions, getEntityGraph, integrations } from '@nexuszero/db';
import { eq, and, inArray } from 'drizzle-orm';
import { llmGenerateSchemaMarkup } from '../llm.js';
import { generateJsonLd } from '../graph/jsonld-generator.js';
import { buildEntityGraph } from '../graph/graph-builder.js';
import { proposeCmsChange } from '@nexuszero/queue';

const AI_PLATFORMS = ['chatgpt', 'perplexity', 'google_ai_overview', 'gemini', 'bing_copilot', 'claude'];

export class SchemaOptimizerHandler {
  async execute(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;
    const entityId = input.entityId as string;
    const targetPlatforms = (input.targetPlatforms as string[]) || AI_PLATFORMS;

    // 1. Get entity profile
    const entity = await withTenantDb(tenantId, async (db) => {
      const [e] = await db.select().from(entityProfiles)
        .where(eq(entityProfiles.id, entityId))
        .limit(1);
      return e;
    });

    if (!entity) {
      return { error: 'Entity not found', entityId };
    }

    // 2. Build/update entity graph relations
    try {
      await buildEntityGraph(tenantId, entityId);
    } catch (e) {
      console.warn('Graph build failed, continuing with flat data:', (e as Error).message);
    }

    // 3. Generate deterministic JSON-LD from knowledge graph
    let graphJsonLd = await generateJsonLd(tenantId, entityId);

    // 4. Enrich with LLM for platform-specific optimizations
    const { schemaJson, recommendations } = await llmGenerateSchemaMarkup({
      entityName: entity.entityName,
      entityType: entity.entityType,
      description: entity.description,
      attributes: entity.attributes as Record<string, unknown> | null,
      targetPlatforms,
    });

    // 5. Merge: graph-based JSON-LD as base, LLM enrichment on top
    const finalSchema = graphJsonLd
      ? mergeSchemas(graphJsonLd, schemaJson)
      : schemaJson;

    // 6. Update entity profile with optimized schema
    await withTenantDb(tenantId, async (db) => {
      await db.update(entityProfiles)
        .set({
          optimizedSchema: finalSchema,
          schemaMarkupStatus: Object.keys(finalSchema).length > 0 ? 'optimized' : 'partial',
          updatedAt: new Date(),
        })
        .where(eq(entityProfiles.id, entityId));
    });

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'optimize_schema',
          category: 'optimization',
          reasoning: `Generated graph-based schema markup for entity "${entity.entityName}" (${entity.entityType}). Graph-based: ${!!graphJsonLd}. Schema generated: ${Object.keys(finalSchema).length > 0}.`,
          trigger: { taskType: 'optimize_schema', entityId, entityName: entity.entityName },
          beforeState: { schemaMarkupStatus: entity.schemaMarkupStatus },
          afterState: { schemaGenerated: Object.keys(finalSchema).length > 0, graphBased: !!graphJsonLd, recommendationCount: recommendations.length },
          confidence: 0.85,
          impactMetric: 'schema_optimization',
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    // Propose CMS schema injection if tenant has a CMS integration
    const CMS_PLATFORMS = ['wordpress', 'webflow', 'shopify', 'contentful'] as const;
    try {
      if (Object.keys(finalSchema).length > 0) {
        const cmsIntegration = await withTenantDb(tenantId, async (db) => {
          const [i] = await db.select().from(integrations)
            .where(and(
              eq(integrations.tenantId, tenantId),
              eq(integrations.status, 'connected'),
              inArray(integrations.platform, [...CMS_PLATFORMS]),
            ))
            .limit(1);
          return i;
        });

        if (cmsIntegration) {
          const schemaScript = `<script type="application/ld+json">${JSON.stringify(finalSchema)}</script>`;
          await proposeCmsChange({
            tenantId,
            integrationId: cmsIntegration.id,
            platform: cmsIntegration.platform,
            resourceType: 'schema_markup',
            resourceId: entityId,
            scope: 'schema',
            proposedBy: job.data.agentId || 'aeo-agent',
            beforeState: { schemaMarkupStatus: entity.schemaMarkupStatus },
            afterState: { schemaScript, jsonLd: finalSchema },
            changeDescription: `Inject optimized JSON-LD schema for entity "${entity.entityName}" (${entity.entityType})`,
            correlationId: job.id,
          });
        }
      }
    } catch (e) {
      console.warn('Failed to propose CMS schema change:', (e as Error).message);
    }

    return {
      entityId,
      entityName: entity.entityName,
      schemaGenerated: Object.keys(finalSchema).length > 0,
      graphBased: !!graphJsonLd,
      schemaJson: finalSchema,
      recommendations,
    };
  }

  /** Handle cross-agent signal: update entity profiles from SEO findings */
  async updateFromSeo(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;
    const keywords = (input.keywords as string[]) || [];
    const seoInsights = input.insights as Record<string, unknown> | undefined;

    // Get all entity profiles
    const entities = await withTenantDb(tenantId, async (db) => {
      return db.select().from(entityProfiles)
        .where(eq(entityProfiles.tenantId, tenantId));
    });

    let updated = 0;
    for (const entity of entities) {
      const currentAttrs = (entity.attributes as Record<string, unknown>) || {};
      const updatedAttrs = {
        ...currentAttrs,
        seoKeywords: keywords,
        lastSeoUpdate: new Date().toISOString(),
        seoInsights,
      };

      await withTenantDb(tenantId, async (db) => {
        await db.update(entityProfiles)
          .set({
            attributes: updatedAttrs,
            updatedAt: new Date(),
          })
          .where(eq(entityProfiles.id, entity.id));
      });
      updated++;
    }

    return {
      entitiesUpdated: updated,
      keywordsApplied: keywords.length,
    };
  }
}

/** Merge graph-generated base schema with LLM-enriched schema */
function mergeSchemas(
  graphSchema: Record<string, unknown>,
  llmSchema: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...graphSchema };

  for (const [key, value] of Object.entries(llmSchema)) {
    // Graph schema takes precedence for structural properties
    if (key === '@context' || key === '@type' || key === 'name') continue;
    // LLM fills gaps — only add properties the graph didn't provide
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  }

  return merged;
}
