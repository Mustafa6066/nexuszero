// ---------------------------------------------------------------------------
// Tool Access Control — inspired by src/ coordinator-mode tool restrictions
//
// Per-agent permission sets controlling which tools/capabilities are available.
// Supports tenant-level overrides for enterprise customization.
// ---------------------------------------------------------------------------

import type { AgentType } from '@nexuszero/shared';
import { getRedisConnection } from './bullmq-client.js';

/** Tool categories available in the platform */
export type ToolCategory =
  | 'llm_completion'
  | 'web_search'
  | 'web_scrape'
  | 'cms_write'
  | 'cms_read'
  | 'db_read'
  | 'db_write'
  | 'file_generate'
  | 'email_send'
  | 'api_external'
  | 'signal_publish'
  | 'memory_store'
  | 'memory_recall'
  | 'analytics_read'
  | 'analytics_write'
  | 'approval_request';

export interface ToolPermissions {
  /** Allowed tool categories */
  allowed: Set<ToolCategory>;
  /** Explicitly denied tool categories (overrides allowed) */
  denied: Set<ToolCategory>;
}

/** Default tool permissions per agent type */
const DEFAULT_AGENT_PERMISSIONS: Record<AgentType, ToolCategory[]> = {
  seo: [
    'llm_completion', 'web_search', 'web_scrape', 'cms_write', 'cms_read',
    'db_read', 'db_write', 'signal_publish', 'memory_store', 'memory_recall',
    'analytics_read', 'approval_request',
  ],
  ad: [
    'llm_completion', 'api_external', 'db_read', 'db_write',
    'signal_publish', 'memory_store', 'memory_recall', 'analytics_read',
    'analytics_write', 'approval_request',
  ],
  creative: [
    'llm_completion', 'file_generate', 'db_read', 'db_write',
    'signal_publish', 'memory_store', 'memory_recall', 'analytics_read',
  ],
  'data-nexus': [
    'llm_completion', 'api_external', 'db_read', 'db_write',
    'signal_publish', 'memory_store', 'memory_recall',
    'analytics_read', 'analytics_write',
  ],
  aeo: [
    'llm_completion', 'web_search', 'web_scrape', 'db_read', 'db_write',
    'signal_publish', 'memory_store', 'memory_recall', 'analytics_read',
  ],
  geo: [
    'llm_completion', 'web_search', 'db_read', 'db_write',
    'signal_publish', 'memory_store', 'memory_recall', 'analytics_read',
  ],
  reddit: [
    'llm_completion', 'web_search', 'web_scrape', 'db_read', 'db_write',
    'signal_publish', 'memory_store', 'memory_recall',
  ],
  social: [
    'llm_completion', 'web_search', 'web_scrape', 'api_external',
    'db_read', 'db_write', 'signal_publish', 'memory_store', 'memory_recall',
  ],
  compatibility: [
    'llm_completion', 'api_external', 'db_read', 'db_write',
    'signal_publish', 'memory_store', 'memory_recall', 'analytics_read',
  ],
  'content-writer': [
    'llm_completion', 'web_search', 'cms_write', 'cms_read',
    'db_read', 'db_write', 'file_generate', 'signal_publish',
    'memory_store', 'memory_recall',
  ],
};

const OVERRIDE_KEY_PREFIX = 'tool:permissions:override';

/**
 * Get effective tool permissions for an agent, merging defaults with
 * any tenant-level overrides.
 */
export async function getToolPermissions(
  agentType: AgentType,
  tenantId: string,
): Promise<ToolPermissions> {
  const defaults = DEFAULT_AGENT_PERMISSIONS[agentType] ?? [];
  const allowed = new Set<ToolCategory>(defaults);
  const denied = new Set<ToolCategory>();

  // Check for tenant-level overrides
  try {
    const redis = getRedisConnection();
    const overrideKey = `${OVERRIDE_KEY_PREFIX}:${tenantId}:${agentType}`;
    const data = await redis.get(overrideKey);

    if (data) {
      const override = JSON.parse(data) as { allow?: ToolCategory[]; deny?: ToolCategory[] };
      if (override.allow) {
        for (const tool of override.allow) allowed.add(tool);
      }
      if (override.deny) {
        for (const tool of override.deny) denied.add(tool);
      }
    }
  } catch {
    // Redis unavailable — use defaults
  }

  return { allowed, denied };
}

/**
 * Check if an agent is permitted to use a specific tool.
 */
export function isToolAllowed(permissions: ToolPermissions, tool: ToolCategory): boolean {
  if (permissions.denied.has(tool)) return false;
  return permissions.allowed.has(tool);
}

/**
 * Set tenant-level tool permission overrides.
 */
export async function setToolOverrides(
  tenantId: string,
  agentType: AgentType,
  overrides: { allow?: ToolCategory[]; deny?: ToolCategory[] },
): Promise<void> {
  const redis = getRedisConnection();
  const key = `${OVERRIDE_KEY_PREFIX}:${tenantId}:${agentType}`;
  await redis.set(key, JSON.stringify(overrides));
}

/**
 * Clear tenant-level tool permission overrides (revert to defaults).
 */
export async function clearToolOverrides(
  tenantId: string,
  agentType: AgentType,
): Promise<void> {
  const redis = getRedisConnection();
  const key = `${OVERRIDE_KEY_PREFIX}:${tenantId}:${agentType}`;
  await redis.del(key);
}
