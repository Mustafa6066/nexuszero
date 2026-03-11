import type { Job } from 'bullmq';
import { withTenantDb, entityProfiles } from '@nexuszero/db';
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
