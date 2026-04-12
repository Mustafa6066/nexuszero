import Parser from 'rss-parser';
import { transcribeAudio } from '../transcribe.js';
import type { Channel, ChannelId, ChannelHealth, ChannelSearchResult, ChannelFetchResult, ChannelFetchOptions } from '../types.js';

const parser = new Parser({
  timeout: 15_000,
  headers: { 'User-Agent': 'NexusZero/1.0 Podcast Channel' },
  customFields: {
    item: [
      ['itunes:summary', 'itunesSummary'] as const,
      ['itunes:duration', 'itunesDuration'] as const,
      ['itunes:episode', 'itunesEpisode'] as const,
      ['itunes:author', 'itunesAuthor'] as const,
    ],
    feed: [
      ['itunes:author', 'itunesAuthor'] as const,
    ],
  },
} as any);

export class PodcastChannel implements Channel {
  readonly id: ChannelId = 'podcast';
  readonly name = 'Podcast';

  async healthCheck(): Promise<ChannelHealth> {
    const hasWhisper = !!process.env.OPENAI_API_KEY;
    return {
      ok: true,
      message: hasWhisper
        ? 'Podcast ready (Whisper transcription available)'
        : 'Podcast ready (Whisper unavailable — will use show notes fallback)',
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * List episodes from a podcast RSS feed URL.
   */
  async search(feedUrl: string): Promise<ChannelSearchResult[]> {
    const feed = await parser.parseURL(feedUrl);
    return (feed.items ?? []).map(item => ({
      id: item.guid || item.link || '',
      title: item.title || 'Untitled Episode',
      url: item.link || item.enclosure?.url || feedUrl,
      snippet: (item as any).itunesSummary || item.contentSnippet || item.content || '',
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
      metadata: {
        feedTitle: feed.title,
        audioUrl: item.enclosure?.url,
        duration: (item as any).itunesDuration,
        episode: (item as any).itunesEpisode,
        author: (item as any).itunesAuthor || item.creator,
      },
    }));
  }

  /**
   * Fetch a single podcast episode. If `options.transcript` is true, attempts
   * Whisper transcription of the audio. Falls back to show notes / summary.
   */
  async fetch(target: string, options?: ChannelFetchOptions): Promise<ChannelFetchResult> {
    // Try parsing as RSS feed to find the episode
    let episode: any = null;
    let feedTitle = '';

    try {
      const feed = await parser.parseURL(target);
      feedTitle = feed.title || '';
      // Use first episode if target is a feed URL
      episode = feed.items?.[0];
    } catch {
      // Not a valid RSS feed — target might be a direct audio URL
    }

    const audioUrl = episode?.enclosure?.url || (target.match(/\.(mp3|m4a|ogg|wav)(\?|$)/i) ? target : null);
    const episodeTitle = episode?.title || 'Unknown Episode';
    const showNotes = this.buildShowNotes(episode);

    let transcript: string | undefined;

    if (options?.transcript && audioUrl) {
      transcript = (await transcribeAudio(audioUrl)) ?? undefined;
    }

    return {
      id: episode?.guid || episode?.link || target,
      title: episodeTitle,
      url: episode?.link || target,
      text: showNotes,
      transcript,
      publishedAt: episode?.pubDate ? new Date(episode.pubDate).toISOString() : undefined,
      metadata: {
        feedTitle,
        audioUrl,
        duration: episode?.itunesDuration,
        author: episode?.itunesAuthor || episode?.creator,
        hasTranscript: !!transcript,
      },
    };
  }

  private buildShowNotes(episode: any): string {
    if (!episode) return '';
    const parts: string[] = [];

    if (episode.title) parts.push(`# ${episode.title}`);
    if (episode.itunesSummary) parts.push(episode.itunesSummary);
    if (episode.contentSnippet && episode.contentSnippet !== episode.itunesSummary) {
      parts.push(episode.contentSnippet);
    }
    if (episode.content && episode.content !== episode.contentSnippet) {
      // Strip HTML tags for clean text
      const cleaned = episode.content.replace(/<[^>]*>/g, '').trim();
      if (cleaned && cleaned !== episode.contentSnippet) {
        parts.push(cleaned);
      }
    }

    return parts.join('\n\n');
  }
}
