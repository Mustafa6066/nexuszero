import Redis from 'ioredis';

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

// Token bucket: 60 req/min for unauthenticated
const RATE_LIMIT_KEY = 'reddit:rate_limit';
const RATE_LIMIT_MAX = 55; // conservative
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
  return fetch(url, {
    headers: { 'User-Agent': userAgent },
  });
}

/** Search a subreddit for posts matching keywords */
export async function searchSubreddit(
  subreddit: string,
  query: string,
  limit = 25,
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json?q=${encodeURIComponent(query)}&sort=new&t=day&limit=${limit}&restrict_sr=1`;

  const res = await redditFetch(url);
  if (!res.ok) {
    console.warn(`[reddit-client] Search failed ${res.status} for r/${subreddit}`);
    return [];
  }

  const data = await res.json() as {
    data?: {
      children?: Array<{
        data: {
          id: string;
          title: string;
          selftext: string;
          author: string;
          url: string;
          subreddit: string;
          score: number;
          permalink: string;
          created_utc: number;
        };
      }>;
    };
  };

  return (data.data?.children ?? []).map(c => ({
    id: `t3_${c.data.id}`,
    title: c.data.title,
    selftext: c.data.selftext,
    author: c.data.author,
    url: `https://www.reddit.com${c.data.permalink}`,
    subreddit: c.data.subreddit,
    score: c.data.score,
    permalink: c.data.permalink,
    createdUtc: c.data.created_utc,
  }));
}

/** Get top comments for a post */
export async function getPostComments(permalink: string, limit = 20): Promise<RedditComment[]> {
  const url = `https://www.reddit.com${permalink}.json?limit=${limit}&sort=top`;
  const res = await redditFetch(url);
  if (!res.ok) return [];

  const data = await res.json() as Array<{
    data?: {
      children?: Array<{
        data: {
          id: string;
          body: string;
          author: string;
          permalink: string;
          score: number;
          created_utc: number;
        };
      }>;
    };
  }>;

  const commentListing = data[1];
  return (commentListing?.data?.children ?? [])
    .filter(c => c.data.body && c.data.body !== '[deleted]')
    .map(c => ({
      id: `t1_${c.data.id}`,
      body: c.data.body,
      author: c.data.author,
      permalink: c.data.permalink,
      score: c.data.score,
      createdUtc: c.data.created_utc,
    }));
}
