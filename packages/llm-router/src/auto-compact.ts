// ---------------------------------------------------------------------------
// Auto-Compaction — inspired by src/ auto-compaction pattern
//
// When LLM context approaches the model's window limit, automatically
// summarize earlier conversation turns using a cheap model (Haiku).
// Circuit-breaker prevents cascading failures if summarization itself fails.
// ---------------------------------------------------------------------------

import { routedCompletion } from './router.js';
import { OPENROUTER_MODELS } from './models.js';

/** Known context windows per model (tokens) */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  [OPENROUTER_MODELS.HAIKU]: 200_000,
  [OPENROUTER_MODELS.GPT4O_MINI]: 128_000,
  [OPENROUTER_MODELS.GEMINI_FLASH]: 1_000_000,
  [OPENROUTER_MODELS.SONNET]: 200_000,
  [OPENROUTER_MODELS.GPT4O]: 128_000,
  [OPENROUTER_MODELS.MISTRAL]: 128_000,
  [OPENROUTER_MODELS.OPUS]: 200_000,
  [OPENROUTER_MODELS.GEMINI_PRO]: 1_000_000,
  [OPENROUTER_MODELS.DEEPSEEK]: 64_000,
  [OPENROUTER_MODELS.LLAMA]: 128_000,
};

/** Reserve buffer for system prompt, response, and safety margin */
const BUFFER_TOKENS = 13_000;

/** Circuit-breaker: consecutive failures before disabling compaction */
const MAX_FAILURES = 3;

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

interface CompactionState {
  consecutiveFailures: number;
  disabledUntil: number;
}

const compactionState: CompactionState = {
  consecutiveFailures: 0,
  disabledUntil: 0,
};

/** Reset timeout after circuit opens (60 seconds) */
const CIRCUIT_RESET_MS = 60_000;

/**
 * Estimate token count for a message array.
 * Uses same approximation as cost-tracker (~3.5 chars/token).
 */
export function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 3.5), 0);
}

/**
 * Get the compaction threshold: the token count at which compaction should trigger.
 */
export function getCompactionThreshold(model: string, maxOutputTokens: number): number {
  const contextWindow = MODEL_CONTEXT_WINDOWS[model] ?? 128_000;
  return contextWindow - maxOutputTokens - BUFFER_TOKENS;
}

/**
 * Check whether the given messages exceed the compaction threshold.
 */
export function needsCompaction(
  messages: ChatMessage[],
  model: string,
  maxOutputTokens: number,
): boolean {
  const threshold = getCompactionThreshold(model, maxOutputTokens);
  const current = estimateMessageTokens(messages);
  return current > threshold;
}

/**
 * Compact a message history by summarizing older messages into a single
 * system-level summary, preserving the most recent turns verbatim.
 *
 * Strategy: keep the system prompt (if any) and last `keepRecentTurns` messages.
 * Summarize everything in between using Haiku.
 */
export async function compactMessages(
  messages: ChatMessage[],
  keepRecentTurns = 4,
): Promise<ChatMessage[]> {
  // Circuit-breaker check
  if (compactionState.consecutiveFailures >= MAX_FAILURES) {
    if (Date.now() < compactionState.disabledUntil) {
      // Circuit open — return messages unchanged
      return messages;
    }
    // Half-open: reset and try
    compactionState.consecutiveFailures = 0;
  }

  if (messages.length <= keepRecentTurns + 1) {
    // Not enough messages to compact
    return messages;
  }

  // Separate system prompt, middle (to summarize), and recent (to keep)
  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');
  const toSummarize = nonSystem.slice(0, -keepRecentTurns);
  const toKeep = nonSystem.slice(-keepRecentTurns);

  if (toSummarize.length === 0) {
    return messages;
  }

  const conversationText = toSummarize
    .map(m => `[${m.role}]: ${m.content}`)
    .join('\n\n');

  try {
    const summary = await routedCompletion({
      model: OPENROUTER_MODELS.HAIKU,
      systemPrompt: 'You are a conversation summarizer. Produce a concise summary preserving all key facts, decisions, data points, and action items. Output only the summary, no preamble.',
      messages: [
        { role: 'user', content: `Summarize this conversation:\n\n${conversationText}` },
      ],
      maxTokens: 1024,
      temperature: 0.3,
    });

    // Reset circuit-breaker on success
    compactionState.consecutiveFailures = 0;

    const compacted: ChatMessage[] = [
      ...systemMessages,
      { role: 'system', content: `[Auto-compacted summary of ${toSummarize.length} earlier messages]\n${summary}` },
      ...toKeep,
    ];

    return compacted;
  } catch (err) {
    compactionState.consecutiveFailures += 1;
    if (compactionState.consecutiveFailures >= MAX_FAILURES) {
      compactionState.disabledUntil = Date.now() + CIRCUIT_RESET_MS;
    }
    console.warn('[auto-compact] Compaction failed, returning original messages:', (err as Error).message);
    return messages;
  }
}

/**
 * Auto-compact messages if they exceed the model's context window threshold.
 * Safe no-op if compaction is not needed or circuit is open.
 */
export async function autoCompactIfNeeded(
  messages: ChatMessage[],
  model: string,
  maxOutputTokens: number,
  keepRecentTurns = 4,
): Promise<ChatMessage[]> {
  if (!needsCompaction(messages, model, maxOutputTokens)) {
    return messages;
  }
  return compactMessages(messages, keepRecentTurns);
}
