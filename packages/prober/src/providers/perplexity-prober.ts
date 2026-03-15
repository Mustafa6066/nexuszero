import type { ProberProvider, ProbeResult, ProbeOptions } from './base-prober.js';

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful assistant. Answer the user\'s question thoroughly, citing specific sources when possible.';

interface PerplexityResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  citations?: string[];
}

export class PerplexityProber implements ProberProvider {
  readonly name = 'perplexity';

  isConfigured(): boolean {
    return !!process.env.PERPLEXITY_API_KEY;
  }

  async probe(query: string, opts?: ProbeOptions): Promise<ProbeResult> {
    const start = Date.now();
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) throw new Error('PERPLEXITY_API_KEY not configured');

    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.PERPLEXITY_PROBE_MODEL || 'sonar',
        max_tokens: opts?.maxTokens ?? 2048,
        temperature: opts?.temperature ?? 0.3,
        messages: [
          { role: 'system', content: opts?.systemPrompt || DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: query },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Perplexity API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = (await response.json()) as PerplexityResponse;
    const text = data.choices[0]?.message?.content || '';

    return {
      responseText: text,
      citations: data.citations || [],
      model: data.model,
      latencyMs: Date.now() - start,
      tokensUsed: data.usage?.total_tokens ?? 0,
      provider: this.name,
    };
  }
}
