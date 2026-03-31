// ---------------------------------------------------------------------------
// Prompt Cache Sharing — cache system prompt prefixes across agents
//
// When multiple agents use the same base system prompt (e.g., company context,
// brand voice), the cache avoids redundant token processing.
// Uses Redis with TTL to store pre-computed prompt sections.
// ---------------------------------------------------------------------------

import { getRedisConnection } from '@nexuszero/shared';
import { createHash } from 'node:crypto';

const CACHE_KEY_PREFIX = 'prompt:cache';
const DEFAULT_TTL_S = 3600; // 1 hour

/**
 * Generate a deterministic cache key from prompt content.
 */
function cacheKey(tenantId: string, contentHash: string): string {
  return `${CACHE_KEY_PREFIX}:${tenantId}:${contentHash}`;
}

/**
 * Hash prompt content for cache key generation.
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Get a cached prompt section, or null if not cached.
 */
export async function getCachedPrompt(
  tenantId: string,
  content: string,
): Promise<string | null> {
  try {
    const redis = getRedisConnection();
    const key = cacheKey(tenantId, hashContent(content));
    return await redis.get(key);
  } catch {
    return null;
  }
}

/**
 * Cache a prompt section for future reuse.
 */
export async function cachePrompt(
  tenantId: string,
  content: string,
  ttlSeconds = DEFAULT_TTL_S,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    const key = cacheKey(tenantId, hashContent(content));
    await redis.setex(key, ttlSeconds, content);
  } catch {
    // Non-critical
  }
}

/**
 * Build a system prompt with cached sections. Sections that are already
 * cached are returned as-is; new sections are cached for future calls.
 *
 * @param tenantId - Tenant ID for cache scoping
 * @param sections - Array of prompt sections to compose
 * @returns Composed system prompt string
 */
export async function buildCachedSystemPrompt(
  tenantId: string,
  sections: string[],
): Promise<string> {
  const results: string[] = [];

  for (const section of sections) {
    const cached = await getCachedPrompt(tenantId, section);
    if (cached) {
      results.push(cached);
    } else {
      await cachePrompt(tenantId, section);
      results.push(section);
    }
  }

  return results.join('\n\n');
}

/**
 * Invalidate all cached prompts for a tenant (e.g., when brand config changes).
 */
export async function invalidateTenantPromptCache(tenantId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    const pattern = `${CACHE_KEY_PREFIX}:${tenantId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Non-critical
  }
}
