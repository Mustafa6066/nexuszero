import { eq, and, sql } from 'drizzle-orm';
import { withTenantDb } from './client.js';
import { entityProfiles } from './schema/aeo-citations.js';
import { entityRelations } from './schema/entity-relations.js';

export interface EntityNode {
  id: string;
  entityName: string;
  entityType: string;
  description: string | null;
  attributes: Record<string, unknown> | null;
}

export interface EntityRelation {
  id: string;
  subjectId: string;
  predicate: string;
  objectId: string | null;
  objectLiteral: string | null;
  objectType: string | null;
  confidence: number;
  source: string;
}

export interface EntityGraphResult {
  root: EntityNode;
  relations: Array<EntityRelation & { object?: EntityNode }>;
  depth: number;
}

/**
 * Get an entity and all its direct relations (1-hop graph traversal).
 */
export async function getEntityGraph(tenantId: string, entityId: string): Promise<EntityGraphResult | null> {
  return withTenantDb(tenantId, async (db) => {
    // Get root entity
    const [root] = await db.select().from(entityProfiles)
      .where(and(eq(entityProfiles.id, entityId), eq(entityProfiles.tenantId, tenantId)))
      .limit(1);

    if (!root) return null;

    // Get all relations where this entity is the subject
    const relations = await db.select().from(entityRelations)
      .where(and(
        eq(entityRelations.subjectId, entityId),
        eq(entityRelations.tenantId, tenantId),
      ));

    // Fetch related entity nodes
    const objectIds = relations.filter(r => r.objectId).map(r => r.objectId!);
    const relatedEntities = objectIds.length > 0
      ? await db.select().from(entityProfiles)
          .where(sql`${entityProfiles.id} = ANY(${objectIds})`)
      : [];

    const entityMap = new Map(relatedEntities.map(e => [e.id, e]));

    const enrichedRelations = relations.map(r => ({
      ...r,
      confidence: r.confidence ?? 0.8,
      source: r.source ?? 'llm',
      object: r.objectId ? entityMap.get(r.objectId) as EntityNode | undefined : undefined,
    }));

    return {
      root: {
        id: root.id,
        entityName: root.entityName,
        entityType: root.entityType,
        description: root.description,
        attributes: root.attributes as Record<string, unknown> | null,
      },
      relations: enrichedRelations,
      depth: 1,
    };
  });
}

/**
 * Recursive graph traversal — get entity and N hops of relations.
 * Uses recursive CTE for efficiency.
 */
export async function getEntityGraphDeep(tenantId: string, entityId: string, maxDepth = 3): Promise<EntityGraphResult | null> {
  return withTenantDb(tenantId, async (db) => {
    // Get root entity
    const [root] = await db.select().from(entityProfiles)
      .where(and(eq(entityProfiles.id, entityId), eq(entityProfiles.tenantId, tenantId)))
      .limit(1);

    if (!root) return null;

    // Recursive CTE to get all relations up to maxDepth
    const result = await db.execute(sql`
      WITH RECURSIVE graph AS (
        SELECT
          er.id, er.subject_id, er.predicate, er.object_id,
          er.object_literal, er.object_type, er.confidence, er.source,
          1 as depth
        FROM entity_relations er
        WHERE er.subject_id = ${entityId} AND er.tenant_id = ${tenantId}

        UNION ALL

        SELECT
          er.id, er.subject_id, er.predicate, er.object_id,
          er.object_literal, er.object_type, er.confidence, er.source,
          g.depth + 1 as depth
        FROM entity_relations er
        INNER JOIN graph g ON g.object_id = er.subject_id
        WHERE er.tenant_id = ${tenantId} AND g.depth < ${maxDepth}
      )
      SELECT DISTINCT * FROM graph ORDER BY depth ASC LIMIT 200
    `);

    const rows = result as unknown as Array<{
      id: string; subject_id: string; predicate: string; object_id: string | null;
      object_literal: string | null; object_type: string | null; confidence: number;
      source: string; depth: number;
    }>;

    // Fetch all referenced entity nodes
    const allEntityIds = new Set<string>();
    for (const row of rows) {
      allEntityIds.add(row.subject_id);
      if (row.object_id) allEntityIds.add(row.object_id);
    }
    allEntityIds.delete(entityId); // Already have root

    const relatedEntities = allEntityIds.size > 0
      ? await db.select().from(entityProfiles)
          .where(sql`${entityProfiles.id} = ANY(${[...allEntityIds]})`)
      : [];

    const entityMap = new Map(relatedEntities.map(e => [e.id, e]));

    const enrichedRelations = rows.map(r => ({
      id: r.id,
      subjectId: r.subject_id,
      predicate: r.predicate,
      objectId: r.object_id,
      objectLiteral: r.object_literal,
      objectType: r.object_type,
      confidence: r.confidence ?? 0.8,
      source: r.source ?? 'llm',
      object: r.object_id ? entityMap.get(r.object_id) as EntityNode | undefined : undefined,
    }));

    return {
      root: {
        id: root.id,
        entityName: root.entityName,
        entityType: root.entityType,
        description: root.description,
        attributes: root.attributes as Record<string, unknown> | null,
      },
      relations: enrichedRelations,
      depth: maxDepth,
    };
  });
}

/**
 * Upsert a relation between two entities.
 */
export async function upsertRelation(tenantId: string, relation: {
  subjectId: string;
  predicate: string;
  objectId?: string;
  objectLiteral?: string;
  objectType?: string;
  confidence?: number;
  source?: string;
}): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    // Check for existing relation
    const existing = await db.select({ id: entityRelations.id }).from(entityRelations)
      .where(and(
        eq(entityRelations.tenantId, tenantId),
        eq(entityRelations.subjectId, relation.subjectId),
        eq(entityRelations.predicate, relation.predicate),
        relation.objectId
          ? eq(entityRelations.objectId, relation.objectId)
          : sql`${entityRelations.objectLiteral} = ${relation.objectLiteral}`,
      ))
      .limit(1);

    if (existing.length > 0) {
      // Update confidence and timestamp
      await db.update(entityRelations)
        .set({
          confidence: relation.confidence ?? 0.8,
          source: relation.source ?? 'llm',
          updatedAt: new Date(),
        })
        .where(eq(entityRelations.id, existing[0]!.id));
    } else {
      await db.insert(entityRelations).values({
        tenantId,
        subjectId: relation.subjectId,
        predicate: relation.predicate,
        objectId: relation.objectId ?? null,
        objectLiteral: relation.objectLiteral ?? null,
        objectType: relation.objectType ?? null,
        confidence: relation.confidence ?? 0.8,
        source: relation.source ?? 'llm',
      });
    }
  });
}

/**
 * Semantic search across entity profiles using pgvector cosine similarity.
 */
export async function searchEntitiesByEmbedding(
  tenantId: string,
  embedding: number[],
  limit = 10,
): Promise<Array<EntityNode & { similarity: number }>> {
  return withTenantDb(tenantId, async (db) => {
    const result = await db.execute(sql`
      SELECT
        id, entity_name, entity_type, description, attributes,
        1 - (embedding <=> ${JSON.stringify(embedding)}::vector) as similarity
      FROM entity_profiles
      WHERE tenant_id = ${tenantId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector ASC
      LIMIT ${limit}
    `);

    return (result as unknown as Array<{
      id: string; entity_name: string; entity_type: string;
      description: string | null; attributes: Record<string, unknown> | null;
      similarity: number;
    }>).map(r => ({
      id: r.id,
      entityName: r.entity_name,
      entityType: r.entity_type,
      description: r.description,
      attributes: r.attributes,
      similarity: r.similarity,
    }));
  });
}
