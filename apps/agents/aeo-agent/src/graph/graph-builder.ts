import { withTenantDb, entityProfiles } from '@nexuszero/db';
import { upsertRelation } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { llmAnalyze } from '../llm.js';

interface InferredRelation {
  predicate: string;
  objectName: string;
  objectType: string;
  objectLiteral?: string;
  confidence: number;
}

/**
 * Build the entity knowledge graph by inferring relations from entity profiles
 * using LLM analysis. Creates/updates entity_relations triples.
 */
export async function buildEntityGraph(
  tenantId: string,
  entityId: string,
): Promise<{ relationsCreated: number; relationsUpdated: number }> {
  // 1. Get the target entity
  const entity = await withTenantDb(tenantId, async (db) => {
    const [e] = await db.select().from(entityProfiles)
      .where(eq(entityProfiles.id, entityId))
      .limit(1);
    return e;
  });

  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  // 2. Get all other entities for this tenant (potential relation targets)
  const allEntities = await withTenantDb(tenantId, async (db) => {
    return db.select().from(entityProfiles)
      .where(eq(entityProfiles.tenantId, tenantId));
  });

  const otherEntities = allEntities.filter(e => e.id !== entityId);

  // 3. Infer relations via LLM
  const relations = await inferRelations(entity, otherEntities);

  let created = 0;
  let updated = 0;

  for (const rel of relations) {
    // Find or create the object entity
    let objectId: string | undefined;

    if (rel.objectName) {
      const existing = otherEntities.find(
        e => e.entityName.toLowerCase() === rel.objectName.toLowerCase(),
      );
      if (existing) {
        objectId = existing.id;
      }
    }

    await upsertRelation(tenantId, {
      subjectId: entityId,
      predicate: rel.predicate,
      objectId,
      objectLiteral: rel.objectLiteral || rel.objectName,
      objectType: rel.objectType,
      confidence: rel.confidence,
      source: 'llm',
    });

    // Track created vs updated (simplified — upsertRelation handles both)
    created++;
  }

  return { relationsCreated: created, relationsUpdated: updated };
}

async function inferRelations(
  entity: typeof entityProfiles.$inferSelect,
  otherEntities: Array<typeof entityProfiles.$inferSelect>,
): Promise<InferredRelation[]> {
  const attrs = (entity.attributes as Record<string, unknown>) || {};

  const prompt = `Analyze this entity and infer Schema.org-compatible relationships:

Entity: ${entity.entityName}
Type: ${entity.entityType}
Description: ${entity.description || 'N/A'}
Attributes: ${JSON.stringify(attrs, null, 2)}

Known related entities in the same organization:
${otherEntities.slice(0, 20).map(e => `- ${e.entityName} (${e.entityType})`).join('\n')}

Infer relationships using Schema.org predicates (e.g., "isPartOf", "hasOffer", "author", "brand", "manufacturer", "sameAs", "subjectOf", "competitor", "category", "industry").

For each relationship, specify:
- predicate: Schema.org property name
- objectName: name of the related entity (from the list above, or a new literal)
- objectType: Schema.org type of the object
- confidence: 0.0-1.0

Return a JSON array of objects. Only include relationships with confidence >= 0.5.`;

  const result = await llmAnalyze(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    const items = Array.isArray(parsed) ? parsed : parsed.relations || [];
    return items.filter((r: InferredRelation) => r.predicate && r.confidence >= 0.5);
  } catch {
    return [];
  }
}
