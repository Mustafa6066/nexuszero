import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ProberProvider, ProbeResult, ProbeOptions } from './base-prober.js';

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful assistant. Answer the user\'s question thoroughly, citing specific sources when possible.';

export class GeminiProber implements ProberProvider {
  readonly name = 'gemini';
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async probe(query: string, opts?: ProbeOptions): Promise<ProbeResult> {
    const start = Date.now();
    const client = this.getClient();
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_PROBE_MODEL || 'gemini-2.0-flash',
      systemInstruction: opts?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      generationConfig: {
        maxOutputTokens: opts?.maxTokens ?? 2048,
        temperature: opts?.temperature ?? 0.3,
      },
    });

    const result = await model.generateContent(query);
    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      responseText: text,
      citations: [], // Gemini standard API doesn't return citation URLs
      model: process.env.GEMINI_PROBE_MODEL || 'gemini-2.0-flash',
      latencyMs: Date.now() - start,
      tokensUsed: (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0),
      provider: this.name,
    };
  }
}
