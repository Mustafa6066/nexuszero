/**
 * Platform Knowledge Base — Stores and retrieves learned platform blueprints.
 * When the LLM analyzes a new platform, the result is cached here for reuse.
 * This gives the agent institutional memory — it learns from every onboarding.
 */

import { getDb } from '@nexuszero/db';
import { sql } from 'drizzle-orm';
import type { PlatformBlueprint } from './platform-analyzer.js';

/** In-memory LRU cache of blueprints (bounded to prevent memory leaks) */
const blueprintCache = new Map<string, { blueprint: PlatformBlueprint; accessedAt: number }>();
const MAX_CACHE_SIZE = 200;

function evictIfNeeded(): void {
  if (blueprintCache.size <= MAX_CACHE_SIZE) return;
  let oldest: string | undefined;
  let oldestTime = Infinity;
  for (const [key, val] of blueprintCache) {
    if (val.accessedAt < oldestTime) {
      oldestTime = val.accessedAt;
      oldest = key;
    }
  }
  if (oldest) blueprintCache.delete(oldest);
}

/** Store a learned blueprint */
export async function storeBlueprint(blueprint: PlatformBlueprint): Promise<void> {
  // In-memory cache
  blueprintCache.set(blueprint.platformId, { blueprint, accessedAt: Date.now() });
  evictIfNeeded();

  // Persist to DB as tenant-agnostic platform knowledge
  const db = getDb();
  try {
    await db.execute(sql`
      INSERT INTO platform_blueprints (platform_id, platform_name, category, blueprint, confidence, analyzed_at, updated_at)
      VALUES (${blueprint.platformId}, ${blueprint.platformName}, ${blueprint.category}, ${JSON.stringify(blueprint)}::jsonb, ${blueprint.confidence}, NOW(), NOW())
      ON CONFLICT (platform_id)
      DO UPDATE SET blueprint = EXCLUDED.blueprint, confidence = EXCLUDED.confidence, updated_at = NOW()
    `);
  } catch (err) {
    // If the table doesn't exist yet, just use in-memory cache
    console.warn('[knowledge-base] DB persist failed (table may not exist):', (err as Error).message);
  }
}

/** Retrieve a previously learned blueprint by platform ID */
export async function getBlueprint(platformId: string): Promise<PlatformBlueprint | null> {
  // Check memory first
  const cached = blueprintCache.get(platformId);
  if (cached) {
    cached.accessedAt = Date.now();
    return cached.blueprint;
  }

  // Try DB
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT blueprint FROM platform_blueprints WHERE platform_id = ${platformId} LIMIT 1
    `);
    if (rows && rows.length > 0) {
      const bp = (rows[0] as any).blueprint as PlatformBlueprint;
      blueprintCache.set(platformId, { blueprint: bp, accessedAt: Date.now() });
      evictIfNeeded();
      return bp;
    }
  } catch {
    // Table may not exist yet
  }

  return null;
}

/** Search for a blueprint by name (fuzzy match) */
export async function searchBlueprints(query: string): Promise<PlatformBlueprint[]> {
  const results: PlatformBlueprint[] = [];
  const lower = query.toLowerCase();

  // Check memory cache first
  for (const [, val] of blueprintCache) {
    if (
      val.blueprint.platformName.toLowerCase().includes(lower) ||
      val.blueprint.platformId.includes(lower) ||
      val.blueprint.category.includes(lower)
    ) {
      results.push(val.blueprint);
    }
  }

  if (results.length > 0) return results;

  // Fall back to DB search
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT blueprint FROM platform_blueprints
      WHERE platform_name ILIKE ${'%' + query + '%'} OR platform_id ILIKE ${'%' + query + '%'}
      LIMIT 10
    `);
    if (rows) {
      for (const row of rows) {
        results.push((row as any).blueprint as PlatformBlueprint);
      }
    }
  } catch {
    // Table may not exist
  }

  return results;
}

/** List all known blueprints */
export async function listBlueprints(): Promise<Array<{ platformId: string; platformName: string; category: string; confidence: number }>> {
  const results: Array<{ platformId: string; platformName: string; category: string; confidence: number }> = [];

  // Memory cache
  for (const [, val] of blueprintCache) {
    results.push({
      platformId: val.blueprint.platformId,
      platformName: val.blueprint.platformName,
      category: val.blueprint.category,
      confidence: val.blueprint.confidence,
    });
  }

  // DB if cache is empty
  if (results.length === 0) {
    const db = getDb();
    try {
      const rows = await db.execute(sql`
        SELECT platform_id, platform_name, category, confidence FROM platform_blueprints ORDER BY platform_name
      `);
      if (rows) {
        for (const row of rows) {
          const r = row as any;
          results.push({
            platformId: r.platform_id,
            platformName: r.platform_name,
            category: r.category,
            confidence: r.confidence,
          });
        }
      }
    } catch {
      // Table may not exist
    }
  }

  return results;
}

/** Update a blueprint's confidence based on real connection results */
export async function updateBlueprintConfidence(platformId: string, connectionSuccess: boolean): Promise<void> {
  const cached = blueprintCache.get(platformId);
  if (cached) {
    // Adjust confidence: success moves it up, failure moves it down
    const delta = connectionSuccess ? 0.05 : -0.1;
    cached.blueprint.confidence = Math.max(0.1, Math.min(1.0, cached.blueprint.confidence + delta));
  }

  const db = getDb();
  try {
    const adjustment = connectionSuccess ? 0.05 : -0.1;
    await db.execute(sql`
      UPDATE platform_blueprints
      SET confidence = GREATEST(0.1, LEAST(1.0, confidence + ${adjustment})), updated_at = NOW()
      WHERE platform_id = ${platformId}
    `);
  } catch {
    // Table may not exist
  }
}
