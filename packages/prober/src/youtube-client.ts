export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  url: string;
}

export interface YouTubeComment {
  commentId: string;
  text: string;
  author: string;
  likeCount: number;
}

const BASE = 'https://www.googleapis.com/youtube/v3';

function getKey(): string | undefined {
  return process.env.YOUTUBE_API_KEY;
}

/**
 * Search YouTube for videos matching a query.
 * Requires YOUTUBE_API_KEY env var.
 */
export async function searchYouTube(query: string, maxResults = 10): Promise<YouTubeSearchResult[]> {
  const key = getKey();
  if (!key) {
    console.warn('[youtube-client] YOUTUBE_API_KEY not configured');
    return [];
  }

  const url = new URL(`${BASE}/search`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('key', key);

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.warn(`[youtube-client] Search error ${response.status}`);
    return [];
  }

  const data = await response.json() as {
    items?: Array<{
      id: { videoId: string };
      snippet: { title: string; description: string; channelTitle: string; publishedAt: string };
    }>;
  };

  return (data.items ?? []).map(item => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
  }));
}

/**
 * Fetch top-level comments for a video, optionally filtered by a search term.
 * Requires YOUTUBE_API_KEY env var.
 */
export async function getVideoComments(videoId: string, searchTerm?: string): Promise<YouTubeComment[]> {
  const key = getKey();
  if (!key) return [];

  const url = new URL(`${BASE}/commentThreads`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('videoId', videoId);
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('key', key);
  if (searchTerm) url.searchParams.set('searchTerms', searchTerm);

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.warn(`[youtube-client] Comments error ${response.status}`);
    return [];
  }

  const data = await response.json() as {
    items?: Array<{
      id: string;
      snippet: {
        topLevelComment: {
          snippet: { textDisplay: string; authorDisplayName: string; likeCount: number };
        };
      };
    }>;
  };

  return (data.items ?? []).map(item => ({
    commentId: item.id,
    text: item.snippet.topLevelComment.snippet.textDisplay,
    author: item.snippet.topLevelComment.snippet.authorDisplayName,
    likeCount: item.snippet.topLevelComment.snippet.likeCount,
  }));
}
