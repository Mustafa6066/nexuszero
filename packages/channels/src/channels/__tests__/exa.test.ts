import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExaChannel } from '../exa.js';

describe('ExaChannel', () => {
  let channel: ExaChannel;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    channel = new ExaChannel();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.EXA_API_KEY;
  });

  it('has correct id and name', () => {
    expect(channel.id).toBe('exa');
    expect(channel.name).toBe('Exa Search');
  });

  it('healthCheck returns ok:false when EXA_API_KEY is unset', async () => {
    const health = await channel.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.message).toContain('EXA_API_KEY');
  });

  it('healthCheck returns ok when API key is set and API responds', async () => {
    process.env.EXA_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const health = await channel.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.message).toContain('accessible');
  });

  it('search returns empty array when no API key', async () => {
    const results = await channel.search('test query');
    expect(results).toEqual([]);
  });

  it('search sends correct request body', async () => {
    process.env.EXA_API_KEY = 'test-key';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          {
            id: 'r1',
            url: 'https://example.com/1',
            title: 'Result 1',
            text: 'Some text about the search query result that is relevant.',
            publishedDate: '2024-01-15',
            score: 0.95,
          },
          {
            id: 'r2',
            url: 'https://example.com/2',
            title: 'Result 2',
            text: 'Another result.',
            score: 0.88,
          },
        ],
      }),
    });

    const results = await channel.search('artificial intelligence marketing', { limit: 5 });

    // Verify request
    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://api.exa.ai/search');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-api-key']).toBe('test-key');

    const body = JSON.parse(opts.body);
    expect(body.query).toBe('artificial intelligence marketing');
    expect(body.numResults).toBe(5);
    expect(body.type).toBe('neural');

    // Verify results
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('r1');
    expect(results[0].title).toBe('Result 1');
    expect(results[0].url).toBe('https://example.com/1');
    expect(results[0].snippet).toBe('Some text about the search query result that is relevant.');
    expect(results[0].score).toBe(0.95);
    expect(results[1].publishedAt).toBeUndefined();
  });

  it('search returns empty array on API error', async () => {
    process.env.EXA_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const results = await channel.search('test');
    expect(results).toEqual([]);
  });

  it('fetch throws (search-only channel)', async () => {
    await expect(channel.fetch('https://example.com')).rejects.toThrow('search only');
  });
});
