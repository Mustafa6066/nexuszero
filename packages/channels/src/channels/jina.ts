import type { Channel, ChannelId, ChannelHealth, ChannelFetchResult } from '../types.js';

const JINA_READER_BASE = 'https://r.jina.ai/';

export class JinaChannel implements Channel {
  readonly id: ChannelId = 'jina';
  readonly name = 'Jina Reader';

  async healthCheck(): Promise<ChannelHealth> {
    try {
      const headers: Record<string, string> = { Accept: 'text/plain' };
      const apiKey = process.env.JINA_API_KEY;
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(`${JINA_READER_BASE}https://example.com`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      return {
        ok: res.ok,
        message: res.ok
          ? `Jina Reader accessible${apiKey ? ' (authenticated)' : ' (free tier)'}`
          : `HTTP ${res.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString() };
    }
  }

  async fetch(targetUrl: string): Promise<ChannelFetchResult> {
    const headers: Record<string, string> = {
      Accept: 'text/plain',
      'X-Return-Format': 'markdown',
    };
    const apiKey = process.env.JINA_API_KEY;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${JINA_READER_BASE}${targetUrl}`, { headers });
    if (!res.ok) throw new Error(`Jina Reader failed: HTTP ${res.status}`);

    const text = await res.text();

    return {
      id: targetUrl,
      title: text.split('\n')[0]?.replace(/^#\s*/, '') || targetUrl,
      url: targetUrl,
      text,
    };
  }
}
