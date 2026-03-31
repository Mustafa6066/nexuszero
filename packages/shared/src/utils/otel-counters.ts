// ---------------------------------------------------------------------------
// OpenTelemetry Metric Counters — inspired by src/ OTel cost-counter pattern
//
// Adds Counter and Histogram instruments for LLM cost, token usage, and
// request metrics. These emit to the OTLP metrics endpoint alongside traces.
// ---------------------------------------------------------------------------

import { metrics, type Counter, type Histogram, type Meter } from '@opentelemetry/api';

let meter: Meter | null = null;
let llmCostCounter: Counter | null = null;
let llmInputTokensCounter: Counter | null = null;
let llmOutputTokensCounter: Counter | null = null;
let llmRequestsCounter: Counter | null = null;
let llmDurationHistogram: Histogram | null = null;

/**
 * Initialize OTel metric instruments. Call once during service startup,
 * after `initializeOpenTelemetry()`.
 */
export function initOtelCounters(serviceName: string): void {
  meter = metrics.getMeter(serviceName, '0.1.0');

  llmCostCounter = meter.createCounter('llm.cost.usd', {
    description: 'Total LLM cost in USD',
    unit: 'usd',
  });

  llmInputTokensCounter = meter.createCounter('llm.tokens.input', {
    description: 'Total LLM input tokens consumed',
    unit: 'tokens',
  });

  llmOutputTokensCounter = meter.createCounter('llm.tokens.output', {
    description: 'Total LLM output tokens consumed',
    unit: 'tokens',
  });

  llmRequestsCounter = meter.createCounter('llm.requests.total', {
    description: 'Total LLM API requests',
  });

  llmDurationHistogram = meter.createHistogram('llm.duration.ms', {
    description: 'LLM request duration in milliseconds',
    unit: 'ms',
  });
}

export interface OtelLlmMetrics {
  model: string;
  agentType: string;
  tenantId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

/**
 * Record LLM metrics. Safe to call even if counters are not initialized
 * (metrics are silently dropped).
 */
export function recordLlmMetrics(m: OtelLlmMetrics): void {
  const attributes = {
    'llm.model': m.model,
    'nexuszero.agent.type': m.agentType,
    'nexuszero.tenant.id': m.tenantId,
  };

  llmCostCounter?.add(m.costUsd, attributes);
  llmInputTokensCounter?.add(m.inputTokens, attributes);
  llmOutputTokensCounter?.add(m.outputTokens, attributes);
  llmRequestsCounter?.add(1, attributes);
  llmDurationHistogram?.record(m.durationMs, attributes);
}

/**
 * Check whether OTel counters have been initialized.
 */
export function isOtelCountersInitialized(): boolean {
  return meter !== null;
}
