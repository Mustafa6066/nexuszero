import { getEntityGraphDeep } from '@nexuszero/db';
import type { EntityGraphResult, EntityNode, EntityRelation } from '@nexuszero/db';

/**
 * Schema.org type mapping from entity types to JSON-LD @type.
 */
const TYPE_MAP: Record<string, string> = {
  product: 'Product',
  organization: 'Organization',
  person: 'Person',
  brand: 'Brand',
  service: 'Service',
  article: 'Article',
  event: 'Event',
  place: 'Place',
  website: 'WebSite',
  software: 'SoftwareApplication',
  course: 'Course',
  company: 'Organization',
  tool: 'SoftwareApplication',
  platform: 'SoftwareApplication',
};

interface JsonLdNode {
  '@context'?: string;
  '@type': string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Generate JSON-LD structured data from an entity's knowledge graph.
 * Traverses the graph (up to 3 hops) and builds nested Schema.org objects.
 */
export async function generateJsonLd(
  tenantId: string,
  entityId: string,
): Promise<JsonLdNode | null> {
  const graph = await getEntityGraphDeep(tenantId, entityId, 3);
  if (!graph) return null;

  return buildJsonLdFromGraph(graph);
}

/**
 * Build a JSON-LD object from a pre-fetched graph result.
 */
export function buildJsonLdFromGraph(graph: EntityGraphResult): JsonLdNode {
  const visited = new Set<string>();
  const root = entityToJsonLd(graph.root, graph.relations, visited);
  root['@context'] = 'https://schema.org';
  return root;
}

function entityToJsonLd(
  entity: EntityNode,
  allRelations: Array<EntityRelation & { object?: EntityNode }>,
  visited: Set<string>,
): JsonLdNode {
  if (visited.has(entity.id)) {
    // Prevent cycles — return minimal reference
    return {
      '@type': mapEntityType(entity.entityType),
      name: entity.entityName,
    };
  }
  visited.add(entity.id);

  const node: JsonLdNode = {
    '@type': mapEntityType(entity.entityType),
    name: entity.entityName,
  };

  if (entity.description) {
    node.description = entity.description;
  }

  // Add flat attributes from entity profile
  if (entity.attributes) {
    for (const [key, value] of Object.entries(entity.attributes)) {
      // Skip internal attributes
      if (key.startsWith('_') || key === 'domains' || key === 'aliases' ||
          key === 'competitorDomains' || key === 'seoKeywords' ||
          key === 'lastSeoUpdate' || key === 'seoInsights') continue;
      if (isSchemaOrgProperty(key)) {
        node[key] = value;
      }
    }
  }

  // Add relations as nested properties
  const entityRelations = allRelations.filter(r => r.subjectId === entity.id);

  for (const rel of entityRelations) {
    const predicate = rel.predicate;

    if (rel.object) {
      // Nested entity — recurse
      const childNode = entityToJsonLd(rel.object, allRelations, visited);
      appendProperty(node, predicate, childNode);
    } else if (rel.objectLiteral) {
      // Literal value
      appendProperty(node, predicate, rel.objectLiteral);
    }
  }

  return node;
}

function mapEntityType(entityType: string): string {
  return TYPE_MAP[entityType.toLowerCase()] || 'Thing';
}

function isSchemaOrgProperty(key: string): boolean {
  const known = [
    'url', 'image', 'logo', 'email', 'telephone', 'address',
    'priceRange', 'ratingValue', 'reviewCount', 'aggregateRating',
    'foundingDate', 'numberOfEmployees', 'areaServed', 'slogan',
    'knowsAbout', 'sameAs', 'identifier', 'alternateName',
  ];
  return known.includes(key);
}

function appendProperty(node: JsonLdNode, key: string, value: unknown): void {
  if (node[key] === undefined) {
    node[key] = value;
  } else if (Array.isArray(node[key])) {
    (node[key] as unknown[]).push(value);
  } else {
    node[key] = [node[key], value];
  }
}
