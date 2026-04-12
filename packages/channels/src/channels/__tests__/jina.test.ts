import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JinaChannel } from '../jina.js';

describe('JinaChannel', () => {
  let channel: JinaChannel;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    channel = new JinaChannel();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.JINA_API_KEY;
  });

  it('has correct id and name', () => {
    expect(channel.id).toBe('jina');
    expect(channel.name).toBe('Jina Reader');
  });

  it('fetch composes correct URL and returns markdown', async () => {
    const mockContent = '# Page Title\n\nSome content here about testing.';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockContent),
    });

    const result = await channel.fetch('https://example.com/page');

    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://r.jina.ai/https://example.com/page');
    expect(opts.headers['X-Return-Format']).toBe('markdown');
    expect(opts.headers['Accept']).toBe('text/plain');

    expect(result.id).toBe('https://example.com/page');
    expect(result.url).toBe('https://example.com/page');
    expect(result.text).toBe(mockContent);
    expect(result.title).toBe('Page Title');
  });

  it('fetch sends auth header when JINA_API_KEY is set', async () => {
    process.env.JINA_API_KEY = 'test-key-123';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('content'),
    });

    await channel.fetch('https://example.com');

    const [, opts] = (fetch as any).mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer test-key-123');
  });

  it('fetch throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    await expect(channel.fetch('https://example.com')).rejects.toThrow('Jina Reader failed: HTTP 429');
  });

  it('healthCheck returns ok when Jina is accessible', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const health = await channel.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.message).toContain('accessible');
  });

  it('healthCheck reports free tier when no API key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const health = await channel.healthCheck();
    expect(health.message).toContain('free tier');
  });

  it('healthCheck reports authenticated when API key set', async () => {
    process.env.JINA_API_KEY = 'key';
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const health = await channel.healthCheck();
    expect(health.message).toContain('authenticated');
  });
});
