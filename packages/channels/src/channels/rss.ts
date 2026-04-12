import Parser from 'rss-parser';
import type { Channel, ChannelId, ChannelHealth, ChannelFetchResult } from '../types.js';

const parser = new Parser({
  timeout: 15_000,
  headers: { 'User-Agent': 'NexusZero/1.0 RSS Channel' },
});

export class RssChannel implements Channel {
  readonly id: ChannelId = 'rss';
  readonly name = 'RSS';

  async healthCheck(): Promise<ChannelHealth> {
    return { ok: true, message: 'RSS parser ready (no external dependency)', checkedAt: new Date().toISOString() };
  }

  async fetch(feedUrl: string): Promise<ChannelFetchResult[]> {
    const feed = await parser.parseURL(feedUrl);

    return (feed.items ?? []).map(item => ({
      id: item.guid || item.link || item.title || '',
      title: item.title || 'Untitled',
      url: item.link || feedUrl,
      text: item.contentSnippet || item.content || item['itunes:summary'] || item.title || '',
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
      metadata: {
        feedTitle: feed.title,
        feedUrl,
        author: item.creator || item.author,
        categories: item.categories,
        enclosure: item.enclosure,
        isoDate: item.isoDate,
      },
    }));
  }
}
