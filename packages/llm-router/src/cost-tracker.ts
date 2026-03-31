import { getRedisConnection } from '@nexuszero/shared';
import { getCurrentTenantId } from '@nexuszero/shared';

// ---------------------------------------------------------------------------
// Per-model pricing (cost per 1M tokens, USD) — OpenRouter rates
// ---------------------------------------------------------------------------

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Fast / cheap
  'anthropic/claude-3-5-haiku': { input: 0.80, output: 4.00 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'google/gemini-2.5-flash-preview-05-20': { input: 0.15, output: 0.60 },
  // Balanced
  'anthropic/claude-sonnet-4-5': { input: 3.00, output: 15.00 },
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'mistralai/mistral-large': { input: 2.00, output: 6.00 },
  // Power
  'anthropic/claude-opus-4-5': { input: 15.00, output: 75.00 },
  'google/gemini-2.5-pro-preview-06-05': { input: 1.25, output: 10.00 },
  'deepseek/deepseek-r1': { input: 0.55, output: 2.19 },
  'meta-llama/llama-3.3-70b-instruct': { input: 0.39, output: 0.39 },
};

// Anthropic direct API models (used by SEO/AEO agents directly)
const ANTHROPIC_DIRECT_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
};

// ---------------------------------------------------------------------------
// Usage record
// ---------------------------------------------------------------------------

export interface LlmUsageRecord {
  tenantId: string;
  agentType: string;
  taskId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  timestamp: string;
}

export interface TenantUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalRequests: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; requests: number }>;
  byAgent: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; requests: number }>;
  period: string;
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? ANTHROPIC_DIRECT_PRICING[model];
  if (!pricing) {
    // Unknown model — estimate conservatively at balanced tier
    return ((inputTokens * 3.0) + (outputTokens * 15.0)) / 1_000_000;
  }
  return ((inputTokens * pricing.input) + (outputTokens * pricing.output)) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Redis-backed usage tracker
// ---------------------------------------------------------------------------

const USAGE_KEY_PREFIX = 'llm:usage';
const DAILY_KEY_TTL = 90 * 24 * 60 * 60; // 90 days retention

function dailyKey(tenantId: string, date: string): string {
  return `${USAGE_KEY_PREFIX}:${tenantId}:daily:${date}`;
}

function monthlyKey(tenantId: string, month: string): string {
  return `${USAGE_KEY_PREFIX}:${tenantId}:monthly:${month}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function thisMonthStr(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export async function recordUsage(record: LlmUsageRecord): Promise<void> {
  let redis: ReturnType<typeof getRedisConnection>;
  try {
    redis = getRedisConnection();
  } catch {
    // Redis unavailable — silently skip (non-critical path)
    return;
  }

  const date = todayStr();
  const month = thisMonthStr();
  const dKey = dailyKey(record.tenantId, date);
  const mKey = monthlyKey(record.tenantId, month);

  const pipeline = redis.pipeline();

  // Increment daily counters
  pipeline.hincrby(dKey, 'requests', 1);
  pipeline.hincrbyfloat(dKey, 'costUsd', record.costUsd);
  pipeline.hincrby(dKey, 'inputTokens', record.inputTokens);
  pipeline.hincrby(dKey, 'outputTokens', record.outputTokens);
  pipeline.hincrby(dKey, `model:${record.model}:requests`, 1);
  pipeline.hincrbyfloat(dKey, `model:${record.model}:costUsd`, record.costUsd);
  pipeline.hincrby(dKey, `model:${record.model}:inputTokens`, record.inputTokens);
  pipeline.hincrby(dKey, `model:${record.model}:outputTokens`, record.outputTokens);
  pipeline.hincrby(dKey, `agent:${record.agentType}:requests`, 1);
  pipeline.hincrbyfloat(dKey, `agent:${record.agentType}:costUsd`, record.costUsd);
  pipeline.expire(dKey, DAILY_KEY_TTL);

  // Increment monthly counters
  pipeline.hincrby(mKey, 'requests', 1);
  pipeline.hincrbyfloat(mKey, 'costUsd', record.costUsd);
  pipeline.hincrby(mKey, 'inputTokens', record.inputTokens);
  pipeline.hincrby(mKey, 'outputTokens', record.outputTokens);
  pipeline.expire(mKey, DAILY_KEY_TTL);

  // Push to recent list (for real-time dashboard)
  const recentKey = `${USAGE_KEY_PREFIX}:${record.tenantId}:recent`;
  pipeline.lpush(recentKey, JSON.stringify(record));
  pipeline.ltrim(recentKey, 0, 99); // Keep last 100 records
  pipeline.expire(recentKey, 7 * 24 * 60 * 60); // 7 days

  await pipeline.exec();
}

export async function getTenantDailyUsage(tenantId: string, date?: string): Promise<TenantUsageSummary | null> {
  let redis: ReturnType<typeof getRedisConnection>;
  try {
    redis = getRedisConnection();
  } catch {
    return null;
  }

  const key = dailyKey(tenantId, date ?? todayStr());
  const data = await redis.hgetall(key);
  if (!data || Object.keys(data).length === 0) return null;

  return parseUsageHash(data, date ?? todayStr());
}

export async function getTenantMonthlyUsage(tenantId: string, month?: string): Promise<TenantUsageSummary | null> {
  let redis: ReturnType<typeof getRedisConnection>;
  try {
    redis = getRedisConnection();
  } catch {
    return null;
  }

  const key = monthlyKey(tenantId, month ?? thisMonthStr());
  const data = await redis.hgetall(key);
  if (!data || Object.keys(data).length === 0) return null;

  return parseUsageHash(data, month ?? thisMonthStr());
}

export async function getRecentUsage(tenantId: string, limit = 50): Promise<LlmUsageRecord[]> {
  let redis: ReturnType<typeof getRedisConnection>;
  try {
    redis = getRedisConnection();
  } catch {
    return [];
  }

  const recentKey = `${USAGE_KEY_PREFIX}:${tenantId}:recent`;
  const items = await redis.lrange(recentKey, 0, limit - 1);
  return items.map(item => JSON.parse(item) as LlmUsageRecord);
}

// ---------------------------------------------------------------------------
// Budget enforcement
// ---------------------------------------------------------------------------

const PLAN_MONTHLY_BUDGETS: Record<string, number> = {
  launchpad: 50,    // $50/month
  growth: 200,      // $200/month  
  enterprise: 1000, // $1000/month (soft limit)
};

export async function checkBudget(tenantId: string, plan: string): Promise<{ allowed: boolean; usedUsd: number; budgetUsd: number; percentUsed: number }> {
  const budget = PLAN_MONTHLY_BUDGETS[plan] ?? PLAN_MONTHLY_BUDGETS['launchpad']!;
  const usage = await getTenantMonthlyUsage(tenantId);
  const usedUsd = usage?.totalCostUsd ?? 0;
  const percentUsed = budget > 0 ? (usedUsd / budget) * 100 : 0;

  return {
    allowed: usedUsd < budget,
    usedUsd,
    budgetUsd: budget,
    percentUsed,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUsageHash(data: Record<string, string>, period: string): TenantUsageSummary {
  const byModel: TenantUsageSummary['byModel'] = {};
  const byAgent: TenantUsageSummary['byAgent'] = {};

  for (const [key, value] of Object.entries(data)) {
    const modelMatch = key.match(/^model:(.+?):(requests|costUsd|inputTokens|outputTokens)$/);
    if (modelMatch) {
      const [, model, metric] = modelMatch;
      if (!byModel[model!]) byModel[model!] = { inputTokens: 0, outputTokens: 0, costUsd: 0, requests: 0 };
      if (metric === 'requests') byModel[model!]!.requests = parseInt(value, 10);
      else if (metric === 'costUsd') byModel[model!]!.costUsd = parseFloat(value);
      else if (metric === 'inputTokens') byModel[model!]!.inputTokens = parseInt(value, 10);
      else if (metric === 'outputTokens') byModel[model!]!.outputTokens = parseInt(value, 10);
      continue;
    }

    const agentMatch = key.match(/^agent:(.+?):(requests|costUsd)$/);
    if (agentMatch) {
      const [, agent, metric] = agentMatch;
      if (!byAgent[agent!]) byAgent[agent!] = { inputTokens: 0, outputTokens: 0, costUsd: 0, requests: 0 };
      if (metric === 'requests') byAgent[agent!]!.requests = parseInt(value, 10);
      else if (metric === 'costUsd') byAgent[agent!]!.costUsd = parseFloat(value);
      continue;
    }
  }

  return {
    totalInputTokens: parseInt(data['inputTokens'] ?? '0', 10),
    totalOutputTokens: parseInt(data['outputTokens'] ?? '0', 10),
    totalCostUsd: parseFloat(data['costUsd'] ?? '0'),
    totalRequests: parseInt(data['requests'] ?? '0', 10),
    byModel,
    byAgent,
    period,
  };
}

// ---------------------------------------------------------------------------
// Auto-tracking wrapper — used by router.ts to record after each completion
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English, ~2 for CJK/Arabic
  return Math.ceil(text.length / 3.5);
}

export interface TrackableCompletion {
  model: string;
  agentType?: string;
  taskId?: string;
  inputMessages: Array<{ content: string }>;
  outputContent: string;
  durationMs: number;
}

export async function trackCompletion(completion: TrackableCompletion): Promise<void> {
  const tenantId = (() => {
    try { return getCurrentTenantId(); } catch { return undefined; }
  })();
  if (!tenantId) return; // No tenant context — skip tracking

  const inputText = completion.inputMessages.map(m => m.content).join(' ');
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(completion.outputContent);
  const costUsd = calculateCost(completion.model, inputTokens, outputTokens);

  await recordUsage({
    tenantId,
    agentType: completion.agentType ?? 'unknown',
    taskId: completion.taskId,
    model: completion.model,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs: completion.durationMs,
    timestamp: new Date().toISOString(),
  });
}
