import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external deps
vi.mock('@nexuszero/db', () => ({
  withTenantDb: vi.fn((_tid, cb) => cb({ insert: vi.fn().mockReturnValue({ values: vi.fn() }) })),
  agentActions: {},
}));
vi.mock('@nexuszero/shared', () => ({
  getCurrentTenantId: vi.fn(() => 'tenant-001'),
}));
vi.mock('@nexuszero/queue', () => ({
  publishAgentSignal: vi.fn(),
}));
vi.mock('@nexuszero/channels', () => ({
  getChannel: vi.fn(),
}));
vi.mock('../../llm.js', () => ({
  llmPodcast: vi.fn(),
}));

import { PodcastIngestHandler } from '../podcast-ingest.js';
import { getChannel } from '@nexuszero/channels';
import { llmPodcast } from '../../llm.js';

const LONG_TRANSCRIPT = 'This is a valid transcript about marketing strategies and AI automation. '.repeat(20);

function makeJob(overrides: Record<string, any> = {}) {
  return {
    id: 'job-1',
    data: { agentId: 'podcast-agent-1', ...overrides },
    updateProgress: vi.fn(),
  } as any;
}

describe('PodcastIngestHandler', () => {
  let handler: PodcastIngestHandler;

  beforeEach(() => {
    handler = new PodcastIngestHandler();
    vi.clearAllMocks();

    (llmPodcast as any).mockResolvedValue(JSON.stringify({
      topics: [{ topic: 'AI Marketing', summary: 'Discussion about AI', keyPoints: ['point1'] }],
      quotes: [{ text: 'Great quote', speaker: 'Host', impactScore: 8 }],
      keyInsights: [{ insight: 'Key insight', context: 'Context', actionable: true }],
      entities: { people: ['Host'], companies: ['Acme'], products: [], concepts: ['AI'] },
      sentiment: 'positive',
      contentDensityScore: 7,
    }));
  });

  it('case 1: uses inline transcript when provided — channel never called', async () => {
    const job = makeJob();
    const result = await handler.execute({
      episodeTitle: 'Test Episode',
      transcript: LONG_TRANSCRIPT,
      showName: 'Test Show',
    }, job);

    expect(getChannel).not.toHaveBeenCalled();
    expect(result.ingestion).toBeTruthy();
    expect(result.ingestion.topics).toHaveLength(1);
    expect(job.updateProgress).toHaveBeenCalledWith(5);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('case 2: calls podcast channel when only episodeUrl is provided, transcript flows through', async () => {
    const mockChannel = {
      fetch: vi.fn().mockResolvedValue({
        id: 'ep-1',
        title: 'Test Episode',
        url: 'https://example.com/ep1',
        text: 'Show notes text',
        transcript: LONG_TRANSCRIPT,
        metadata: { hasTranscript: true },
      }),
    };
    (getChannel as any).mockReturnValue(mockChannel);

    const job = makeJob();
    const result = await handler.execute({
      episodeTitle: 'Test Episode',
      episodeUrl: 'https://example.com/feed.xml',
      // No transcript provided
    }, job);

    expect(getChannel).toHaveBeenCalledWith('podcast');
    expect(mockChannel.fetch).toHaveBeenCalledWith('https://example.com/feed.xml', { transcript: true });
    expect(result.ingestion).toBeTruthy();
    expect(result.ingestion.topics).toHaveLength(1);
  });

  it('case 3: channel returns no transcript — falls back to show notes text', async () => {
    const showNotesText = 'This is a comprehensive show notes text about marketing strategies for modern businesses. '.repeat(5);
    const mockChannel = {
      fetch: vi.fn().mockResolvedValue({
        id: 'ep-1',
        title: 'Test Episode',
        url: 'https://example.com/ep1',
        text: showNotesText,
        transcript: undefined,
        metadata: { hasTranscript: false },
      }),
    };
    (getChannel as any).mockReturnValue(mockChannel);

    const job = makeJob();
    const result = await handler.execute({
      episodeTitle: 'Test Episode',
      episodeUrl: 'https://example.com/feed.xml',
    }, job);

    expect(getChannel).toHaveBeenCalledWith('podcast');
    expect(result.ingestion).toBeTruthy();
  });

  it('returns error when no transcript and no episodeUrl/feedUrl', async () => {
    const job = makeJob();
    const result = await handler.execute({
      episodeTitle: 'Test Episode',
      // Nothing to work with
    }, job);

    expect(result.error).toBe('Transcript too short or missing');
  });

  it('returns error when channel fetch also fails', async () => {
    const mockChannel = {
      fetch: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    (getChannel as any).mockReturnValue(mockChannel);

    const job = makeJob();
    const result = await handler.execute({
      episodeTitle: 'Test Episode',
      episodeUrl: 'https://example.com/feed.xml',
    }, job);

    expect(result.error).toBe('Transcript too short or missing');
  });
});
