import type { Channel, ChannelId, ChannelHealth, ChannelSearchResult, ChannelFetchResult, ChannelSearchOptions } from '../types.js';

const BASE = 'https://www.googleapis.com/youtube/v3';

function getKey(): string | undefined {
  return process.env.YOUTUBE_API_KEY;
}

export class YouTubeChannel implements Channel {
  readonly id: ChannelId = 'youtube';
  readonly name = 'YouTube';

  async healthCheck(): Promise<ChannelHealth> {
    const key = getKey();
    if (!key) {
      return { ok: false, message: 'YOUTUBE_API_KEY not configured', checkedAt: new Date().toISOString() };
    }
    try {
      const url = `${BASE}/search?part=snippet&q=test&type=video&maxResults=1&key=${key}`;
      const res = await fetch(url);
      return {
        ok: res.ok,
        message: res.ok ? 'YouTube API accessible' : `HTTP ${res.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString() };
    }
  }

  async search(query: string, options?: ChannelSearchOptions): Promise<ChannelSearchResult[]> {
    const key = getKey();
    if (!key) return [];

    const limit = options?.limit || 10;
    const url = new URL(`${BASE}/search`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', String(limit));
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('key', key);

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const data = await res.json() as {
      items?: Array<{
        id: { videoId: string };
        snippet: { title: string; description: string; channelTitle: string; publishedAt: string };
      }>;
    };

    return (data.items ?? []).map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      snippet: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      metadata: { channelTitle: item.snippet.channelTitle },
    }));
  }

  async fetch(videoId: string): Promise<ChannelFetchResult> {
    const key = getKey();
    if (!key) throw new Error('YOUTUBE_API_KEY not configured');

    // Fetch video details
    const detailUrl = `${BASE}/videos?part=snippet,statistics&id=${encodeURIComponent(videoId)}&key=${key}`;
    const detailRes = await fetch(detailUrl);
    if (!detailRes.ok) throw new Error(`YouTube video fetch failed: HTTP ${detailRes.status}`);

    const detailData = await detailRes.json() as {
      items?: Array<{
        snippet: { title: string; description: string; channelTitle: string; publishedAt: string };
        statistics: { viewCount: string; likeCount: string; commentCount: string };
      }>;
    };

    const video = detailData.items?.[0];
    if (!video) throw new Error(`Video not found: ${videoId}`);

    // Fetch top comments
    const commentsUrl = `${BASE}/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&maxResults=30&order=relevance&key=${key}`;
    const commentsRes = await fetch(commentsUrl);
    let commentText = '';
    if (commentsRes.ok) {
      const commentsData = await commentsRes.json() as {
        items?: Array<{
          snippet: { topLevelComment: { snippet: { textDisplay: string; authorDisplayName: string; likeCount: number } } };
        }>;
      };
      const comments = (commentsData.items ?? []).map(item => ({
        text: item.snippet.topLevelComment.snippet.textDisplay,
        author: item.snippet.topLevelComment.snippet.authorDisplayName,
        likes: item.snippet.topLevelComment.snippet.likeCount,
      }));
      commentText = comments.map(c => `[${c.author}] (${c.likes} likes): ${c.text}`).join('\n\n');
    }

    return {
      id: videoId,
      title: video.snippet.title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      text: `${video.snippet.description}\n\n--- Top Comments ---\n\n${commentText}`,
      publishedAt: video.snippet.publishedAt,
      metadata: {
        channelTitle: video.snippet.channelTitle,
        viewCount: parseInt(video.statistics.viewCount, 10),
        likeCount: parseInt(video.statistics.likeCount, 10),
        commentCount: parseInt(video.statistics.commentCount, 10),
      },
    };
  }
}
