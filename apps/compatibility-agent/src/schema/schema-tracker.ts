/**
 * Schema Tracker — Captures and stores API response schemas for drift detection.
 * Periodically snapshots the shape of API responses and stores hashes.
 */

import { createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { getDb, schemaSnapshots } from '@nexuszero/db';
import type { Platform, SchemaSnapshot } from '@nexuszero/shared';
import { getConnector } from '../connectors/connector-registry.js';
import { retrieveTokens } from '../oauth/token-vault.js';

/** Capture a schema snapshot from a sample API response */
export async function captureSchemaSnapshot(
  tenantId: string,
  integrationId: string,
  platform: Platform,
  endpointPath: string,
  responseBody: unknown,
): Promise<SchemaSnapshot> {
  const db = getDb();
  const schema = extractSchema(responseBody);
  const schemaHash = hashSchema(schema);

  // Check for existing snapshot
  const existing = await db
    .select()
    .from(schemaSnapshots)
    .where(and(
      eq(schemaSnapshots.integrationId, integrationId),
      eq(schemaSnapshots.endpointPath, endpointPath),
    ))
    .limit(1);

  if (existing.length > 0) {
    // Update existing
    await db.update(schemaSnapshots)
      .set({
        responseSchema: schema,
        schemaHash,
        capturedAt: new Date(),
      })
      .where(eq(schemaSnapshots.id, existing[0]!.id));
  } else {
    // Create new
    await db.insert(schemaSnapshots).values({
      integrationId,
      tenantId,
      endpointPath,
      responseSchema: schema,
      schemaHash,
    });
  }

  return {
    endpointPath,
    responseSchema: schema,
    schemaHash,
    capturedAt: new Date(),
  };
}

/** Run a schema snapshot sweep for all endpoints of a platform */
export async function refreshSchemaSnapshots(
  tenantId: string,
  integrationId: string,
  platform: Platform,
): Promise<SchemaSnapshot[]> {
  const connector = getConnector(platform);
  const tokens = await retrieveTokens(integrationId);
  if (!tokens) return [];

  // Make a lightweight request to get a sample response shape
  try {
    const healthResult = await connector.healthCheck(tokens.accessToken);
    if (!healthResult.healthy) return [];

    // Capture the health endpoint schema as a baseline
    return [
      await captureSchemaSnapshot(
        tenantId,
        integrationId,
        platform,
        `/${platform}/health`,
        healthResult,
      ),
    ];
  } catch {
    return [];
  }
}

/** Extract a structural schema from a JSON response (types only, no values) */
function extractSchema(obj: unknown, depth = 0): Record<string, unknown> {
  if (depth > 5) return { type: 'unknown' };

  if (obj === null || obj === undefined) return { type: 'null' };
  if (typeof obj === 'string') return { type: 'string' };
  if (typeof obj === 'number') return { type: 'number' };
  if (typeof obj === 'boolean') return { type: 'boolean' };

  if (Array.isArray(obj)) {
    return {
      type: 'array',
      items: obj.length > 0 ? extractSchema(obj[0], depth + 1) : { type: 'unknown' },
    };
  }

  if (typeof obj === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      properties[key] = extractSchema(value, depth + 1);
    }
    return { type: 'object', properties };
  }

  return { type: typeof obj };
}

/** Create a deterministic hash of a schema */
function hashSchema(schema: Record<string, unknown>): string {
  const canonical = JSON.stringify(schema, Object.keys(schema).sort());
  return createHash('sha256').update(canonical).digest('hex');
}
