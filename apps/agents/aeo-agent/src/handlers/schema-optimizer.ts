import type { Job } from 'bullmq';
import { withTenantDb, entityProfiles, agentActions } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { llmGenerateSchemaMarkup } from '../llm.js';

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

    // 2. Generate optimized schema markup
    const { schemaJson, recommendations } = await llmGenerateSchemaMarkup({
      entityName: entity.entityName,
      entityType: entity.entityType,
      description: entity.description,
      attributes: entity.attributes as Record<string, unknown> | null,
      targetPlatforms,
    });

    // 3. Update entity profile with optimized schema
    await withTenantDb(tenantId, async (db) => {
      await db.update(entityProfiles)
        .set({
          optimizedSchema: schemaJson,
          schemaMarkupStatus: Object.keys(schemaJson).length > 0 ? 'optimized' : 'partial',
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
          reasoning: `Generated optimized schema markup for entity "${entity.entityName}" (${entity.entityType}). Schema generated: ${Object.keys(schemaJson).length > 0}.`,
          trigger: { taskType: 'optimize_schema', entityId, entityName: entity.entityName },
          beforeState: { schemaMarkupStatus: entity.schemaMarkupStatus },
          afterState: { schemaGenerated: Object.keys(schemaJson).length > 0, recommendationCount: recommendations.length },
          confidence: 0.8,
          impactMetric: 'schema_optimization',
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    return {
      entityId,
      entityName: entity.entityName,
      schemaGenerated: Object.keys(schemaJson).length > 0,
      schemaJson,
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
