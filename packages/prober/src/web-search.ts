export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

interface SerperResponse {
  organic?: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
  }>;
}

/**
 * Standalone web search via Serper.dev.
 * Use this directly in agent handlers — bypasses probe caching and LLM-style formatting.
 * Requires SERPER_API_KEY env var.
 */
export async function webSearch(query: string, numResults = 8): Promise<WebSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.warn('[web-search] SERPER_API_KEY not configured — returning empty results');
    return [];
  }

  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: numResults }),
  });

  if (!response.ok) {
    console.warn(`[web-search] Serper error ${response.status}: ${response.statusText}`);
    return [];
  }

  const data = await response.json() as SerperResponse;
  return (data.organic ?? []).map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
    position: r.position,
  }));
}
