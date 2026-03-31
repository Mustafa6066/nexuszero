import type { ProberProvider, ProbeResult, ProbeOptions } from './base-prober.js';

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SerperResponse {
  organic?: SerperResult[];
  knowledgeGraph?: { description?: string };
}

/**
 * Serper.dev Google Search prober — returns real-time web results.
 * Implements ProberProvider so it can participate in citation extraction.
 */
export class SerperProber implements ProberProvider {
  readonly name = 'serper';

  isConfigured(): boolean {
    return Boolean(process.env.SERPER_API_KEY);
  }

  async probe(query: string, _opts?: ProbeOptions): Promise<ProbeResult> {
    const start = Date.now();
    const apiKey = process.env.SERPER_API_KEY!;

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 10 }),
    });

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as SerperResponse;
    const results = data.organic ?? [];

    const responseText = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`)
      .join('\n\n');

    const citations = results.map(r => r.link);

    return {
      responseText,
      citations,
      model: 'google-search',
      latencyMs: Date.now() - start,
      tokensUsed: 0,
      provider: this.name,
    };
  }
}
