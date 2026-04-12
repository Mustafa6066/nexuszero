export type ChannelId = 'reddit' | 'youtube' | 'rss' | 'jina' | 'exa' | 'podcast';

export interface ChannelHealth {
  ok: boolean;
  message: string;
  checkedAt: string;
}

export interface ChannelSearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface ChannelFetchResult {
  id: string;
  title: string;
  url: string;
  text: string;
  transcript?: string;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelSearchOptions {
  limit?: number;
  subreddit?: string;
  timeRange?: string;
}

export interface ChannelFetchOptions {
  transcript?: boolean;
}

export interface Channel {
  readonly id: ChannelId;
  readonly name: string;

  healthCheck(): Promise<ChannelHealth>;
  search?(query: string, options?: ChannelSearchOptions): Promise<ChannelSearchResult[]>;
  fetch(target: string, options?: ChannelFetchOptions): Promise<ChannelFetchResult | ChannelFetchResult[]>;
}
