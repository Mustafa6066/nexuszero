import Redis from 'ioredis';
import type { Channel, ChannelId, ChannelHealth, ChannelSearchResult, ChannelFetchResult, ChannelSearchOptions } from '../types.js';

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  url: string;
  subreddit: string;
  score: number;
  permalink: string;
  createdUtc: number;
}

export interface RedditComment {
  id: string;
  body: string;
  author: string;
  permalink: string;
  score: number;
  createdUtc: number;
}

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 3, lazyConnect: true });
  return redis;
}

const RATE_LIMIT_KEY = 'channels:reddit:rate_limit';
const RATE_LIMIT_MAX = 55;
const RATE_LIMIT_WINDOW_S = 60;

async function acquireRateLimit(): Promise<void> {
  const r = getRedis();
  const count = await r.incr(RATE_LIMIT_KEY);
  if (count === 1) await r.expire(RATE_LIMIT_KEY, RATE_LIMIT_WINDOW_S);
  if (count > RATE_LIMIT_MAX) {
    const ttl = await r.ttl(RATE_LIMIT_KEY);
    await new Promise(resolve => setTimeout(resolve, ttl * 1000 + 100));
  }
}

async function redditFetch(url: string): Promise<Response> {
  await acquireRateLimit();
  const userAgent = process.env.REDDIT_USER_AGENT || 'NexusZero/1.0';
  return fetch(url, { headers: { 'User-Agent': userAgent } });
}

export class RedditChannel implements Channel {
  readonly id: ChannelId = 'reddit';
  readonly name = 'Reddit';

  async healthCheck(): Promise<ChannelHealth> {
    try {
      const res = await redditFetch('https://www.reddit.com/r/test/hot.json?limit=1');
      return {
        ok: res.ok,
        message: res.ok ? 'Reddit accessible' : `HTTP ${res.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString() };
    }
  }

  async search(query: string, options?: ChannelSearchOptions): Promise<ChannelSearchResult[]> {
    const subreddit = options?.subreddit || 'all';
    const limit = options?.limit || 25;
    const timeRange = options?.timeRange || 'day';
    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json?q=${encodeURIComponent(query)}&sort=new&t=${timeRange}&limit=${limit}&restrict_sr=1`;

    const res = await redditFetch(url);
    if (!res.ok) return [];

    const data = await res.json() as {
      data?: {
        children?: Array<{
          data: {
            id: string; title: string; selftext: string; author: string;
            url: string; subreddit: string; score: number; permalink: string; created_utc: number;
          };
        }>;
      };
    };

    return (data.data?.children ?? []).map(c => ({
      id: `t3_${c.data.id}`,
      title: c.data.title,
      url: `https://www.reddit.com${c.data.permalink}`,
      snippet: c.data.selftext.slice(0, 300),
      publishedAt: new Date(c.data.created_utc * 1000).toISOString(),
      score: c.data.score,
      metadata: { author: c.data.author, subreddit: c.data.subreddit },
    }));
  }

  async fetch(permalink: string): Promise<ChannelFetchResult> {
    // Normalize permalink
    const path = permalink.startsWith('/') ? permalink : `/${permalink}`;
    const url = `https://www.reddit.com${path}.json?limit=20&sort=top`;
    const res = await redditFetch(url);
    if (!res.ok) throw new Error(`Reddit fetch failed: HTTP ${res.status}`);

    const data = await res.json() as Array<{
      data?: {
        children?: Array<{
          data: {
            id: string; title: string; selftext: string; author: string;
            permalink: string; score: number; body?: string; created_utc: number;
          };
        }>;
      };
    }>;

    const post = data[0]?.data?.children?.[0]?.data;
    if (!post) throw new Error('Post not found');

    const comments = (data[1]?.data?.children ?? [])
      .filter(c => c.data.body && c.data.body !== '[deleted]')
      .map(c => ({ author: c.data.author, body: c.data.body!, score: c.data.score }));

    const commentText = comments.map(c => `[${c.author}] (score: ${c.score}): ${c.body}`).join('\n\n');

    return {
      id: `t3_${post.id}`,
      title: post.title,
      url: `https://www.reddit.com${post.permalink}`,
      text: `${post.selftext}\n\n--- Comments ---\n\n${commentText}`,
      publishedAt: new Date(post.created_utc * 1000).toISOString(),
      metadata: { author: post.author, score: post.score, commentCount: comments.length },
    };
  }
}
