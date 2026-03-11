/**
 * Drift Detector — Compares current API response schemas against stored snapshots
 * and detects breaking changes (field removal, type changes).
 */

import { eq, and } from 'drizzle-orm';
import { getDb, schemaSnapshots } from '@nexuszero/db';
import type { SchemaDrift, Platform } from '@nexuszero/shared';
import { captureSchemaSnapshot } from './schema-tracker.js';

export interface DriftReport {
  integrationId: string;
  drifts: SchemaDrift[];
  checkedEndpoints: number;
  driftDetected: boolean;
}

/** Check for schema drift on a specific integration */
export async function checkSchemaDrift(
  tenantId: string,
  integrationId: string,
  platform: Platform,
  currentResponse: unknown,
  endpointPath: string,
): Promise<SchemaDrift | null> {
  // Get stored snapshot
  const db = getDb();
  const existing = await db
    .select()
    .from(schemaSnapshots)
    .where(and(
      eq(schemaSnapshots.integrationId, integrationId),
      eq(schemaSnapshots.endpointPath, endpointPath),
    ))
    .limit(1);

  if (existing.length === 0) {
    // No previous snapshot — capture one now and return no drift
    await captureSchemaSnapshot(tenantId, integrationId, platform, endpointPath, currentResponse);
    return null;
  }

  const previousSchema = existing[0]!.responseSchema as Record<string, unknown>;
  const currentSchema = extractSchemaShape(currentResponse);

  const changes = diffSchemas(previousSchema, currentSchema, '');

  if (changes.length === 0) return null;

  const breaking = changes.some(
    (c) => c.changeType === 'field_removed' || c.changeType === 'type_changed',
  );

  return {
    endpointPath,
    previousHash: existing[0]!.schemaHash,
    currentHash: '', // Will be set when new snapshot is captured
    changes,
    breaking,
    detectedAt: new Date(),
  };
}

interface SchemaChange {
  path: string;
  changeType: 'field_added' | 'field_removed' | 'type_changed';
  previousType?: string;
  currentType?: string;
}

/** Compare two schemas and return differences */
function diffSchemas(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  parentPath: string,
): SchemaChange[] {
  const changes: SchemaChange[] = [];

  const prevType = previous.type as string | undefined;
  const currType = current.type as string | undefined;

  // Type changed at this level
  if (prevType !== currType) {
    changes.push({
      path: parentPath || '.',
      changeType: 'type_changed',
      previousType: prevType,
      currentType: currType,
    });
    return changes;
  }

  if (prevType === 'object') {
    const prevProps = (previous.properties ?? {}) as Record<string, Record<string, unknown>>;
    const currProps = (current.properties ?? {}) as Record<string, Record<string, unknown>>;

    // Check for removed fields
    for (const key of Object.keys(prevProps)) {
      if (!(key in currProps)) {
        changes.push({
          path: parentPath ? `${parentPath}.${key}` : key,
          changeType: 'field_removed',
          previousType: (prevProps[key]?.type as string) ?? 'unknown',
        });
      } else {
        // Recurse into shared fields
        changes.push(...diffSchemas(prevProps[key]!, currProps[key]!, parentPath ? `${parentPath}.${key}` : key));
      }
    }

    // Check for added fields
    for (const key of Object.keys(currProps)) {
      if (!(key in prevProps)) {
        changes.push({
          path: parentPath ? `${parentPath}.${key}` : key,
          changeType: 'field_added',
          currentType: (currProps[key]?.type as string) ?? 'unknown',
        });
      }
    }
  }

  if (prevType === 'array') {
    const prevItems = (previous.items ?? {}) as Record<string, unknown>;
    const currItems = (current.items ?? {}) as Record<string, unknown>;
    changes.push(...diffSchemas(prevItems, currItems, `${parentPath}[]`));
  }

  return changes;
}

/** Extract schema shape from response (same as schema-tracker) */
function extractSchemaShape(obj: unknown, depth = 0): Record<string, unknown> {
  if (depth > 5) return { type: 'unknown' };
  if (obj === null || obj === undefined) return { type: 'null' };
  if (typeof obj === 'string') return { type: 'string' };
  if (typeof obj === 'number') return { type: 'number' };
  if (typeof obj === 'boolean') return { type: 'boolean' };
  if (Array.isArray(obj)) {
    return {
      type: 'array',
      items: obj.length > 0 ? extractSchemaShape(obj[0], depth + 1) : { type: 'unknown' },
    };
  }
  if (typeof obj === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      properties[key] = extractSchemaShape(value, depth + 1);
    }
    return { type: 'object', properties };
  }
  return { type: typeof obj };
}
