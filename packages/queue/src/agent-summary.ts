// ---------------------------------------------------------------------------
// Agent Progress Summaries — inspired by src/ coordinator-mode pattern
//
// Periodically generates short (3-5 word) present-tense summaries of what
// an agent is currently doing. Pushes updates via WebSocket for real-time
// dashboard feedback.
// ---------------------------------------------------------------------------

import { getRedisConnection } from './bullmq-client.js';

export interface AgentSummary {
  tenantId: string;
  agentType: string;
  taskId: string;
  summary: string;
  actionCount: number;
  updatedAt: string;
}

/** Minimum actions before generating a summary */
const MIN_ACTIONS_FOR_SUMMARY = 3;
/** Summary update interval in ms */
const SUMMARY_INTERVAL_MS = 30_000;

const SUMMARY_KEY_PREFIX = 'agent:summary';

/**
 * Record an agent action (called by handlers during task processing).
 * Returns the updated action count.
 */
export async function recordAction(
  tenantId: string,
  agentType: string,
  taskId: string,
  actionDescription: string,
): Promise<number> {
  try {
    const redis = getRedisConnection();
    const key = `${SUMMARY_KEY_PREFIX}:${tenantId}:${agentType}:${taskId}`;

    const pipeline = redis.pipeline();
    pipeline.rpush(`${key}:actions`, actionDescription);
    pipeline.expire(`${key}:actions`, 3600); // 1 hour TTL
    const results = await pipeline.exec();

    // rpush returns the new list length
    return (results?.[0]?.[1] as number) ?? 1;
  } catch {
    return 0;
  }
}

/**
 * Generate a summary string from recent actions.
 * Uses a simple heuristic (last action) rather than an LLM call
 * to keep latency and cost minimal.
 */
export async function generateSummary(
  tenantId: string,
  agentType: string,
  taskId: string,
): Promise<AgentSummary | null> {
  try {
    const redis = getRedisConnection();
    const key = `${SUMMARY_KEY_PREFIX}:${tenantId}:${agentType}:${taskId}`;

    const actions = await redis.lrange(`${key}:actions`, 0, -1);
    if (actions.length < MIN_ACTIONS_FOR_SUMMARY) {
      return null;
    }

    // Use the most recent action as the summary base
    const lastAction = actions[actions.length - 1]!;
    // Truncate to ~5 words for dashboard display
    const summary = truncateToWords(lastAction, 5);

    const agentSummary: AgentSummary = {
      tenantId,
      agentType,
      taskId,
      summary,
      actionCount: actions.length,
      updatedAt: new Date().toISOString(),
    };

    // Cache the summary
    await redis.setex(
      `${key}:current`,
      3600,
      JSON.stringify(agentSummary),
    );

    return agentSummary;
  } catch {
    return null;
  }
}

/**
 * Get the current cached summary for an agent's active task.
 */
export async function getCurrentSummary(
  tenantId: string,
  agentType: string,
  taskId: string,
): Promise<AgentSummary | null> {
  try {
    const redis = getRedisConnection();
    const key = `${SUMMARY_KEY_PREFIX}:${tenantId}:${agentType}:${taskId}:current`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) as AgentSummary : null;
  } catch {
    return null;
  }
}

/**
 * Get all active agent summaries for a tenant.
 */
export async function getTenantAgentSummaries(tenantId: string): Promise<AgentSummary[]> {
  try {
    const redis = getRedisConnection();
    const pattern = `${SUMMARY_KEY_PREFIX}:${tenantId}:*:current`;
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    return (results ?? [])
      .map(([, val]) => val ? JSON.parse(val as string) as AgentSummary : null)
      .filter((s): s is AgentSummary => s !== null);
  } catch {
    return [];
  }
}

/**
 * Clean up summaries when a task completes.
 */
export async function clearTaskSummary(
  tenantId: string,
  agentType: string,
  taskId: string,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    const key = `${SUMMARY_KEY_PREFIX}:${tenantId}:${agentType}:${taskId}`;
    await redis.del(`${key}:actions`, `${key}:current`);
  } catch {
    // Best effort
  }
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ');
}

export { SUMMARY_INTERVAL_MS };
