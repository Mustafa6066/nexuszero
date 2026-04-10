/**
 * Migration Engine — Detects API version changes, generates field mappings,
 * and produces backward-compatible wrappers for platform API migrations.
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb, schemaSnapshots, integrations } from '@nexuszero/db';
import { createLogger } from '@nexuszero/shared';
import type { Platform } from '@nexuszero/shared';
import { withSpan } from '@nexuszero/shared';

const log = createLogger('migration-engine');

export interface FieldMapping {
  oldField: string;
  newField: string | null; // null = field removed
  transform?: 'rename' | 'type_cast' | 'split' | 'merge' | 'removed';
  castTo?: string;
}

export interface MigrationPlan {
  platform: Platform;
  integrationId: string;
  fromVersion: string;
  toVersion: string;
  fieldMappings: FieldMapping[];
  breakingChanges: string[];
  compatWrapper: string; // Generated wrapper function code
  riskLevel: 'low' | 'medium' | 'high';
  estimatedImpact: string;
}

export interface MigrationResult {
  status: 'success' | 'partial' | 'failed';
  plan: MigrationPlan;
  appliedMappings: number;
  errors: string[];
}

/**
 * Detect API version changes by comparing schema snapshots.
 */
export async function detectVersionChanges(
  tenantId: string,
  integrationId: string,
  platform: Platform,
): Promise<{ hasChanges: boolean; changes: FieldMapping[]; fromVersion: string; toVersion: string }> {
  return withSpan('migration.detectVersionChanges', async () => {
    const db = getDb();

    // Get the two most recent snapshots for this integration
    const snapshots = await db
      .select()
      .from(schemaSnapshots)
      .where(
        and(
          eq(schemaSnapshots.tenantId, tenantId),
          eq(schemaSnapshots.integrationId, integrationId),
        ),
      )
      .orderBy(desc(schemaSnapshots.createdAt))
      .limit(2);

    if (snapshots.length < 2) {
      return { hasChanges: false, changes: [], fromVersion: 'current', toVersion: 'current' };
    }

    const [current, previous] = snapshots;
    const currentSchema = (current.schema as Record<string, unknown>) ?? {};
    const previousSchema = (previous.schema as Record<string, unknown>) ?? {};

    const changes = compareSchemas(previousSchema, currentSchema);

    const fromVersion = (previous.apiVersion as string) ?? 'unknown';
    const toVersion = (current.apiVersion as string) ?? 'unknown';

    log.info('Version change detection', {
      tenantId,
      integrationId,
      platform,
      changesFound: changes.length,
      fromVersion,
      toVersion,
    });

    return {
      hasChanges: changes.length > 0,
      changes,
      fromVersion,
      toVersion,
    };
  });
}

/**
 * Generate field mappings between old and new schema versions.
 */
export function generateFieldMappings(
  oldSchema: Record<string, unknown>,
  newSchema: Record<string, unknown>,
): FieldMapping[] {
  return compareSchemas(oldSchema, newSchema);
}

/**
 * Generate a backward-compatible wrapper based on field mappings.
 */
export function generateCompatWrapper(
  platform: Platform,
  mappings: FieldMapping[],
): string {
  if (mappings.length === 0) return '// No mappings required — schemas are compatible';

  const lines: string[] = [
    `/** Auto-generated backward-compatible wrapper for ${platform} API migration */`,
    `export function migrateResponse(data: Record<string, unknown>): Record<string, unknown> {`,
    `  const result = { ...data };`,
  ];

  for (const m of mappings) {
    switch (m.transform) {
      case 'rename':
        lines.push(`  // Renamed: ${m.oldField} → ${m.newField}`);
        lines.push(`  if ('${m.oldField}' in result && !('${m.newField}' in result)) {`);
        lines.push(`    result['${m.newField}'] = result['${m.oldField}'];`);
        lines.push(`    delete result['${m.oldField}'];`);
        lines.push(`  }`);
        break;
      case 'type_cast':
        lines.push(`  // Type changed: ${m.oldField} → cast to ${m.castTo}`);
        lines.push(`  if ('${m.oldField}' in result) {`);
        if (m.castTo === 'string') {
          lines.push(`    result['${m.oldField}'] = String(result['${m.oldField}']);`);
        } else if (m.castTo === 'number') {
          lines.push(`    result['${m.oldField}'] = Number(result['${m.oldField}']);`);
        }
        lines.push(`  }`);
        break;
      case 'removed':
        lines.push(`  // Removed field: ${m.oldField} (no longer in API)`);
        break;
      default:
        if (m.newField && m.newField !== m.oldField) {
          lines.push(`  // Mapped: ${m.oldField} → ${m.newField}`);
          lines.push(`  if ('${m.oldField}' in result) { result['${m.newField}'] = result['${m.oldField}']; }`);
        }
    }
  }

  lines.push(`  return result;`);
  lines.push(`}`);

  return lines.join('\n');
}

/**
 * Build a complete migration plan for a platform integration.
 */
export async function buildMigrationPlan(
  tenantId: string,
  integrationId: string,
  platform: Platform,
): Promise<MigrationPlan> {
  return withSpan('migration.buildPlan', async () => {
    const detection = await detectVersionChanges(tenantId, integrationId, platform);

    const breakingChanges = detection.changes
      .filter(c => c.transform === 'removed' || c.transform === 'type_cast')
      .map(c => c.transform === 'removed'
        ? `Field "${c.oldField}" was removed`
        : `Field "${c.oldField}" type changed to ${c.castTo}`);

    const riskLevel = breakingChanges.length > 3 ? 'high'
      : breakingChanges.length > 0 ? 'medium'
      : 'low';

    const compatWrapper = generateCompatWrapper(platform, detection.changes);

    const plan: MigrationPlan = {
      platform,
      integrationId,
      fromVersion: detection.fromVersion,
      toVersion: detection.toVersion,
      fieldMappings: detection.changes,
      breakingChanges,
      compatWrapper,
      riskLevel,
      estimatedImpact: `${detection.changes.length} field(s) affected, ${breakingChanges.length} breaking change(s)`,
    };

    log.info('Migration plan built', {
      tenantId,
      platform,
      risk: riskLevel,
      mappings: detection.changes.length,
      breaking: breakingChanges.length,
    });

    return plan;
  });
}

/**
 * Execute a migration (apply wrapper and update integration metadata).
 */
export async function executeMigration(
  tenantId: string,
  plan: MigrationPlan,
): Promise<MigrationResult> {
  return withSpan('migration.execute', async () => {
    const db = getDb();
    const errors: string[] = [];
    let appliedMappings = 0;

    try {
      // Store the migration wrapper and update version metadata
      await db.update(integrations)
        .set({
          metadata: {
            migrationPlan: {
              fromVersion: plan.fromVersion,
              toVersion: plan.toVersion,
              fieldMappings: plan.fieldMappings,
              compatWrapper: plan.compatWrapper,
              appliedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrations.tenantId, tenantId),
            eq(integrations.id, plan.integrationId),
          ),
        );

      appliedMappings = plan.fieldMappings.length;
    } catch (err) {
      errors.push(`Failed to apply migration: ${(err as Error).message}`);
    }

    const status = errors.length > 0
      ? appliedMappings > 0 ? 'partial' : 'failed'
      : 'success';

    log.info('Migration executed', {
      tenantId,
      status,
      applied: appliedMappings,
      errors: errors.length,
    });

    return { status, plan, appliedMappings, errors };
  });
}

// ── Internal helpers ──

function compareSchemas(
  oldSchema: Record<string, unknown>,
  newSchema: Record<string, unknown>,
): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const oldKeys = new Set(Object.keys(flattenObject(oldSchema)));
  const newKeys = new Set(Object.keys(flattenObject(newSchema)));
  const flatOld = flattenObject(oldSchema);
  const flatNew = flattenObject(newSchema);

  // Fields removed in new version
  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      // Check if it was renamed (same type exists under different key)
      const possibleRename = findPossibleRename(key, flatOld[key], flatNew, newKeys);
      if (possibleRename) {
        mappings.push({ oldField: key, newField: possibleRename, transform: 'rename' });
        newKeys.delete(possibleRename);
      } else {
        mappings.push({ oldField: key, newField: null, transform: 'removed' });
      }
    }
  }

  // Fields with type changes
  for (const key of oldKeys) {
    if (newKeys.has(key)) {
      const oldType = typeof flatOld[key];
      const newType = typeof flatNew[key];
      if (oldType !== newType && oldType !== 'undefined' && newType !== 'undefined') {
        mappings.push({ oldField: key, newField: key, transform: 'type_cast', castTo: newType });
      }
    }
  }

  return mappings;
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function findPossibleRename(
  oldKey: string,
  oldValue: unknown,
  flatNew: Record<string, unknown>,
  remainingNewKeys: Set<string>,
): string | null {
  const oldBaseName = oldKey.split('.').pop()?.toLowerCase() ?? '';
  const oldType = typeof oldValue;

  for (const newKey of remainingNewKeys) {
    const newBaseName = newKey.split('.').pop()?.toLowerCase() ?? '';
    // Heuristic: same base name similarity + same type = likely rename
    if (typeof flatNew[newKey] === oldType && isSimilar(oldBaseName, newBaseName)) {
      return newKey;
    }
  }
  return null;
}

function isSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  // Simple Levenshtein-ish check: if one contains the other or edit distance is small
  if (a.includes(b) || b.includes(a)) return true;
  if (Math.abs(a.length - b.length) > 3) return false;
  let diff = 0;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff <= 2;
}
