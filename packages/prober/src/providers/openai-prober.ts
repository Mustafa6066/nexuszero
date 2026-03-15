import OpenAI from 'openai';
import type { ProberProvider, ProbeResult, ProbeOptions } from './base-prober.js';

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful assistant. Answer the user\'s question thoroughly, citing specific sources when possible.';

export class OpenAIProber implements ProberProvider {
  readonly name = 'openai';
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async probe(query: string, opts?: ProbeOptions): Promise<ProbeResult> {
    const start = Date.now();
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_PROBE_MODEL || 'gpt-4o',
      max_tokens: opts?.maxTokens ?? 2048,
      temperature: opts?.temperature ?? 0.3,
      messages: [
        { role: 'system', content: opts?.systemPrompt || DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
    });

    const text = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens ?? 0;

    return {
      responseText: text,
      citations: [], // OpenAI Chat API doesn't return structured citations
      model: response.model,
      latencyMs: Date.now() - start,
      tokensUsed,
      provider: this.name,
    };
  }
}
