import type { Channel, ChannelId, ChannelHealth, ChannelSearchResult, ChannelSearchOptions } from '../types.js';

const EXA_API_BASE = 'https://api.exa.ai';

export class ExaChannel implements Channel {
  readonly id: ChannelId = 'exa';
  readonly name = 'Exa Search';

  async healthCheck(): Promise<ChannelHealth> {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      return { ok: false, message: 'EXA_API_KEY not configured', checkedAt: new Date().toISOString() };
    }
    try {
      const res = await fetch(`${EXA_API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ query: 'test', numResults: 1 }),
        signal: AbortSignal.timeout(10_000),
      });
      return {
        ok: res.ok,
        message: res.ok ? 'Exa API accessible' : `HTTP ${res.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString() };
    }
  }

  async search(query: string, options?: ChannelSearchOptions): Promise<ChannelSearchResult[]> {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) return [];

    const limit = options?.limit || 10;
    const res = await fetch(`${EXA_API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        query,
        numResults: limit,
        useAutoprompt: true,
        type: 'neural',
      }),
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      results?: Array<{
        id: string;
        url: string;
        title: string;
        text?: string;
        publishedDate?: string;
        score?: number;
      }>;
    };

    return (data.results ?? []).map(r => ({
      id: r.id,
      title: r.title || r.url,
      url: r.url,
      snippet: r.text?.slice(0, 300) || '',
      publishedAt: r.publishedDate,
      score: r.score,
    }));
  }

  async fetch(url: string): Promise<never> {
    throw new Error('Exa channel supports search only — use Jina channel for page fetching');
  }
}
