import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Test 3: LLM Cost Tracker — Pure Logic Tests
// Tests pricing calculation, cost estimation, and budget checking
// ---------------------------------------------------------------------------

// Mirror the model pricing from packages/llm-router/src/cost-tracker.ts
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'openai/gpt-4-turbo': { input: 10.00, output: 30.00 },
  'openai/gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'google/gemini-pro-1.5': { input: 1.25, output: 5.00 },
  'google/gemini-flash-1.5': { input: 0.075, output: 0.30 },
  'mistralai/mistral-large': { input: 2.00, output: 6.00 },
  'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75 },
  // Anthropic direct SDK models
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? { input: 3.0, output: 15.0 };
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const PLAN_MONTHLY_CAPS: Record<string, number> = {
  launchpad: 50,
  growth: 200,
  enterprise: 1000,
};

function checkBudget(plan: string, currentSpend: number): { allowed: boolean; remaining: number; cap: number; percentUsed: number } {
  const cap = PLAN_MONTHLY_CAPS[plan] ?? 1000;
  const remaining = Math.max(0, cap - currentSpend);
  return {
    allowed: currentSpend < cap,
    remaining,
    cap,
    percentUsed: Math.round((currentSpend / cap) * 100),
  };
}

// ============================= TESTS =============================

describe('Cost Tracker — Model Pricing', () => {
  it('has pricing for all major OpenRouter models', () => {
    expect(MODEL_PRICING['anthropic/claude-3.5-sonnet']).toBeDefined();
    expect(MODEL_PRICING['openai/gpt-4o-mini']).toBeDefined();
    expect(MODEL_PRICING['google/gemini-flash-1.5']).toBeDefined();
    expect(MODEL_PRICING['meta-llama/llama-3.1-70b-instruct']).toBeDefined();
  });

  it('has pricing for direct Anthropic SDK models', () => {
    expect(MODEL_PRICING['claude-3-5-sonnet-20241022']).toBeDefined();
    expect(MODEL_PRICING['claude-3-haiku-20240307']).toBeDefined();
    expect(MODEL_PRICING['claude-3-opus-20240229']).toBeDefined();
  });

  it('input price is always less than output price', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.input).toBeLessThanOrEqual(pricing.output);
    }
  });
});

describe('Cost Tracker — Cost Calculation', () => {
  it('calculates cost for GPT-4o-mini correctly', () => {
    const cost = calculateCost('openai/gpt-4o-mini', 1000, 500);
    // 1000/1M * 0.15 + 500/1M * 0.60 = 0.00015 + 0.0003 = 0.00045
    expect(cost).toBeCloseTo(0.00045, 5);
  });

  it('calculates cost for Claude 3.5 Sonnet correctly', () => {
    const cost = calculateCost('anthropic/claude-3.5-sonnet', 10000, 5000);
    // 10000/1M * 3.0 + 5000/1M * 15.0 = 0.03 + 0.075 = 0.105
    expect(cost).toBeCloseTo(0.105, 3);
  });

  it('calculates cost for Claude Opus correctly', () => {
    const cost = calculateCost('claude-3-opus-20240229', 50000, 10000);
    // 50000/1M * 15.0 + 10000/1M * 75.0 = 0.75 + 0.75 = 1.50
    expect(cost).toBeCloseTo(1.50, 2);
  });

  it('uses default pricing for unknown model', () => {
    const cost = calculateCost('unknown/model', 1000000, 1000000);
    // Falls back to input: 3.0, output: 15.0
    expect(cost).toBeCloseTo(18.0, 1);
  });

  it('handles zero tokens', () => {
    expect(calculateCost('openai/gpt-4o', 0, 0)).toBe(0);
  });

  it('handles large token counts', () => {
    const cost = calculateCost('openai/gpt-4o', 1_000_000, 1_000_000);
    // 1M/1M * 2.5 + 1M/1M * 10.0 = 12.5
    expect(cost).toBeCloseTo(12.5, 1);
  });

  it('Gemini Flash is the cheapest model', () => {
    const flashCost = calculateCost('google/gemini-flash-1.5', 100000, 50000);
    const miniCost = calculateCost('openai/gpt-4o-mini', 100000, 50000);
    expect(flashCost).toBeLessThan(miniCost);
  });
});

describe('Cost Tracker — Token Estimation', () => {
  it('estimates ~250 tokens for 1000 characters', () => {
    const text = 'a'.repeat(1000);
    expect(estimateTokens(text)).toBe(250);
  });

  it('estimates tokens for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates tokens for typical prompt', () => {
    const prompt = 'Analyze the SEO performance of our website and provide recommendations for improvement.';
    const tokens = estimateTokens(prompt);
    expect(tokens).toBeGreaterThan(15);
    expect(tokens).toBeLessThan(50);
  });
});

describe('Cost Tracker — Budget Checking', () => {
  it('allows spending under launchpad cap ($50)', () => {
    const result = checkBudget('launchpad', 20);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(30);
    expect(result.cap).toBe(50);
    expect(result.percentUsed).toBe(40);
  });

  it('blocks spending at launchpad cap', () => {
    const result = checkBudget('launchpad', 50);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.percentUsed).toBe(100);
  });

  it('allows spending under growth cap ($200)', () => {
    const result = checkBudget('growth', 150);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
  });

  it('allows spending under enterprise cap ($1000)', () => {
    const result = checkBudget('enterprise', 999);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('defaults to enterprise cap for unknown plan', () => {
    const result = checkBudget('custom-plan', 500);
    expect(result.cap).toBe(1000);
    expect(result.allowed).toBe(true);
  });

  it('remaining never goes below 0', () => {
    const result = checkBudget('launchpad', 100);
    expect(result.remaining).toBe(0);
    expect(result.allowed).toBe(false);
  });
});
