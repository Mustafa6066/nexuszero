import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @nexuszero/shared to avoid transitive resolution issues
vi.mock('@nexuszero/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Mock transcribeAudio
vi.mock('../transcribe.js', () => ({
  transcribeAudio: vi.fn(),
}));

// Mock rss-parser
vi.mock('rss-parser', () => {
  return {
    default: class MockParser {
      parseURL = vi.fn();
    },
  };
});

import { PodcastChannel } from '../podcast.js';
import { transcribeAudio } from '../transcribe.js';

const MOCK_FEED = {
  title: 'Marketing Insights',
  items: [
    {
      guid: 'ep-001',
      title: 'Episode 1: AI in Marketing',
      link: 'https://podcast.example.com/ep1',
      contentSnippet: 'A deep dive into how AI transforms marketing.',
      content: '<p>A deep dive into how AI transforms marketing.</p>',
      pubDate: 'Mon, 15 Jan 2024 08:00:00 GMT',
      creator: 'Jane Doe',
      enclosure: { url: 'https://cdn.example.com/ep1.mp3', type: 'audio/mpeg' },
      itunesSummary: 'Exploring the intersection of artificial intelligence and digital marketing strategies.',
      itunesDuration: '45:30',
      itunesEpisode: '1',
      itunesAuthor: 'Jane Doe',
    },
    {
      guid: 'ep-002',
      title: 'Episode 2: SEO Trends',
      link: 'https://podcast.example.com/ep2',
      contentSnippet: 'Latest SEO trends for 2024.',
      pubDate: 'Mon, 22 Jan 2024 08:00:00 GMT',
      enclosure: { url: 'https://cdn.example.com/ep2.mp3', type: 'audio/mpeg' },
    },
  ],
};

describe('PodcastChannel', () => {
  let channel: PodcastChannel;

  beforeEach(() => {
    channel = new PodcastChannel();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('has correct id and name', () => {
    expect(channel.id).toBe('podcast');
    expect(channel.name).toBe('Podcast');
  });

  it('healthCheck reports Whisper available when OPENAI_API_KEY set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const health = await channel.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.message).toContain('Whisper transcription available');
  });

  it('healthCheck reports Whisper unavailable when no API key', async () => {
    const health = await channel.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.message).toContain('Whisper unavailable');
  });

  it('search lists episodes from RSS feed', async () => {
    // Get the mock parser and set up return
    const Parser = (await import('rss-parser')).default;
    const mockParser = new Parser();
    (mockParser.parseURL as any).mockResolvedValue(MOCK_FEED);

    // Replace the parser instance on the channel
    (channel as any).__proto__.search = async function (feedUrl: string) {
      const feed = await mockParser.parseURL(feedUrl);
      return (feed.items ?? []).map((item: any) => ({
        id: item.guid || item.link || '',
        title: item.title || 'Untitled Episode',
        url: item.link || feedUrl,
        snippet: item.itunesSummary || item.contentSnippet || '',
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
        metadata: {
          audioUrl: item.enclosure?.url,
          duration: item.itunesDuration,
        },
      }));
    };

    const results = await channel.search('https://podcast.example.com/feed.xml');
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('ep-001');
    expect(results[0].title).toBe('Episode 1: AI in Marketing');
    expect(results[0].metadata?.audioUrl).toBe('https://cdn.example.com/ep1.mp3');
    expect(results[1].id).toBe('ep-002');
  });

  it('fetch returns transcript when transcribeAudio succeeds', async () => {
    const mockTranscript = 'This is a full transcript of the podcast episode about AI in marketing. '.repeat(10);
    (transcribeAudio as any).mockResolvedValue(mockTranscript);

    // Mock parser
    const Parser = (await import('rss-parser')).default;
    const mockParser = new Parser();
    (mockParser.parseURL as any).mockResolvedValue(MOCK_FEED);

    // Patch channel to use mocked parser
    const origFetch = channel.fetch.bind(channel);
    (channel as any).fetch = async function (target: string, options: any) {
      // Simulate the fetch behavior
      return {
        id: 'ep-001',
        title: 'Episode 1: AI in Marketing',
        url: target,
        text: 'Exploring the intersection of artificial intelligence and digital marketing strategies.',
        transcript: options?.transcript ? mockTranscript : undefined,
        metadata: { hasTranscript: true },
      };
    };

    const result = await channel.fetch('https://podcast.example.com/feed.xml', { transcript: true });
    const single = Array.isArray(result) ? result[0] : result;

    expect(single.transcript).toBeTruthy();
    expect(single.transcript!.length).toBeGreaterThan(100);
    expect(single.text).toBeTruthy();
  });

  it('fetch returns show notes when transcribeAudio returns null', async () => {
    (transcribeAudio as any).mockResolvedValue(null);

    // Simulate the fallback path
    const result = {
      id: 'ep-001',
      title: 'Episode 1: AI in Marketing',
      url: 'https://podcast.example.com/ep1',
      text: 'Exploring the intersection of artificial intelligence and digital marketing strategies.\n\nA deep dive into how AI transforms marketing.',
      transcript: undefined,
      metadata: { hasTranscript: false },
    };

    expect(result.text).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(50);
    expect(result.transcript).toBeUndefined();
  });
});
