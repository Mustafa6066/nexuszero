// ---------------------------------------------------------------------------
// Token Budget with Diminishing Returns — inspired by src/ cost-tracker pattern
//
// Tracks per-task token spend and detects when further LLM calls yield
// diminishing value (< 500 new tokens for 3+ consecutive turns).
// ---------------------------------------------------------------------------

export interface TaskBudgetConfig {
  /** Maximum total tokens (input + output) allowed for this task */
  maxTokens?: number;
  /** Maximum USD spend allowed for this task */
  maxCostUsd?: number;
  /** Maximum number of LLM round-trips allowed */
  maxTurns?: number;
}

export interface BudgetTracker {
  /** How many LLM turns have been executed */
  turnCount: number;
  /** Total input tokens consumed so far */
  totalInputTokens: number;
  /** Total output tokens consumed so far */
  totalOutputTokens: number;
  /** Total cost in USD so far */
  totalCostUsd: number;
  /** Consecutive turns where output delta was below threshold */
  consecutiveLowDeltaTurns: number;
  /** Output tokens from the most recent turn */
  lastOutputTokens: number;
  /** Timestamp when the budget tracker was created */
  startedAt: number;
}

export interface BudgetCheckResult {
  /** Whether the task is allowed to continue */
  allowed: boolean;
  /** Why the budget was exhausted (if not allowed) */
  reason?: 'token_limit' | 'cost_limit' | 'turn_limit' | 'diminishing_returns' | 'budget_threshold';
  /** Percentage of token budget consumed (0–100) */
  tokenPercentUsed: number;
  /** Percentage of cost budget consumed (0–100) */
  costPercentUsed: number;
}

/** Threshold: output below this for N consecutive turns → diminishing returns */
const DIMINISHING_RETURNS_THRESHOLD = 500;
/** How many consecutive low-delta turns before stopping */
const DIMINISHING_RETURNS_CONSECUTIVE = 3;
/** Stop at 90% of budget to leave room for wrap-up */
const BUDGET_COMPLETION_THRESHOLD = 0.9;

export function createBudgetTracker(): BudgetTracker {
  return {
    turnCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    consecutiveLowDeltaTurns: 0,
    lastOutputTokens: 0,
    startedAt: Date.now(),
  };
}

/**
 * Record a completed LLM turn and update the tracker in-place.
 */
export function recordTurn(
  tracker: BudgetTracker,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): void {
  tracker.turnCount += 1;
  tracker.totalInputTokens += inputTokens;
  tracker.totalOutputTokens += outputTokens;
  tracker.totalCostUsd += costUsd;
  tracker.lastOutputTokens = outputTokens;

  if (outputTokens < DIMINISHING_RETURNS_THRESHOLD) {
    tracker.consecutiveLowDeltaTurns += 1;
  } else {
    tracker.consecutiveLowDeltaTurns = 0;
  }
}

/**
 * Check whether the task should continue based on budget constraints.
 */
export function checkTokenBudget(
  tracker: BudgetTracker,
  config: TaskBudgetConfig,
): BudgetCheckResult {
  const totalTokens = tracker.totalInputTokens + tracker.totalOutputTokens;

  const tokenPercentUsed = config.maxTokens
    ? (totalTokens / config.maxTokens) * 100
    : 0;

  const costPercentUsed = config.maxCostUsd
    ? (tracker.totalCostUsd / config.maxCostUsd) * 100
    : 0;

  // Check diminishing returns first (most nuanced signal)
  if (
    tracker.turnCount >= DIMINISHING_RETURNS_CONSECUTIVE &&
    tracker.consecutiveLowDeltaTurns >= DIMINISHING_RETURNS_CONSECUTIVE
  ) {
    return { allowed: false, reason: 'diminishing_returns', tokenPercentUsed, costPercentUsed };
  }

  // Check hard turn limit
  if (config.maxTurns && tracker.turnCount >= config.maxTurns) {
    return { allowed: false, reason: 'turn_limit', tokenPercentUsed, costPercentUsed };
  }

  // Check token budget at 90% threshold
  if (config.maxTokens && totalTokens >= config.maxTokens * BUDGET_COMPLETION_THRESHOLD) {
    return { allowed: false, reason: 'budget_threshold', tokenPercentUsed, costPercentUsed };
  }

  // Check hard token limit
  if (config.maxTokens && totalTokens >= config.maxTokens) {
    return { allowed: false, reason: 'token_limit', tokenPercentUsed, costPercentUsed };
  }

  // Check cost limit
  if (config.maxCostUsd && tracker.totalCostUsd >= config.maxCostUsd) {
    return { allowed: false, reason: 'cost_limit', tokenPercentUsed, costPercentUsed };
  }

  return { allowed: true, tokenPercentUsed, costPercentUsed };
}

/** Default budget configs by agent complexity tier */
export const DEFAULT_TASK_BUDGETS: Record<string, TaskBudgetConfig> = {
  /** Light tasks: summaries, classifications */
  light: { maxTokens: 8_000, maxTurns: 3, maxCostUsd: 0.05 },
  /** Standard tasks: audits, analyses */
  standard: { maxTokens: 32_000, maxTurns: 8, maxCostUsd: 0.50 },
  /** Heavy tasks: content generation, multi-step reasoning */
  heavy: { maxTokens: 100_000, maxTurns: 15, maxCostUsd: 2.00 },
  /** Unlimited: admin/debug tasks (still has diminishing-returns guard) */
  unlimited: {},
};
