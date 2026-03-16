import * as cheerio from 'cheerio';

export interface SeoSignals {
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  canonicalUrl: string | null;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  robotsMeta: string | null;
  hreflangTags: Array<{ lang: string; href: string }>;
  imageAlts: { total: number; withAlt: number; missingAlt: number };
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  loadingHints: { preconnect: string[]; prefetch: string[]; preload: string[] };
}

/**
 * Extract SEO-relevant signals from rendered HTML.
 */
export function extractSeoSignals(html: string, pageUrl: string): SeoSignals {
  const $ = cheerio.load(html);
  let parsedPageUrl: URL;
  try {
    parsedPageUrl = new URL(pageUrl);
  } catch {
    parsedPageUrl = new URL('https://example.com');
  }

  // Title
  const title = $('title').first().text().trim();

  // Meta description
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() || '';

  // Headings
  const h1: string[] = [];
  $('h1').each((_i, el) => { h1.push($(el).text().trim()); });
  const h2: string[] = [];
  $('h2').each((_i, el) => { h2.push($(el).text().trim()); });

  // Canonical
  const canonicalUrl = $('link[rel="canonical"]').attr('href') || null;

  // OG tags
  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_i, el) => {
    const prop = $(el).attr('property') || '';
    const content = $(el).attr('content') || '';
    if (prop) ogTags[prop] = content;
  });

  // Twitter tags
  const twitterTags: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_i, el) => {
    const name = $(el).attr('name') || '';
    const content = $(el).attr('content') || '';
    if (name) twitterTags[name] = content;
  });

  // Robots meta
  const robotsMeta = $('meta[name="robots"]').attr('content') || null;

  // Hreflang
  const hreflangTags: Array<{ lang: string; href: string }> = [];
  $('link[rel="alternate"][hreflang]').each((_i, el) => {
    const lang = $(el).attr('hreflang') || '';
    const href = $(el).attr('href') || '';
    if (lang && href) hreflangTags.push({ lang, href });
  });

  // Images
  let totalImages = 0;
  let withAlt = 0;
  $('img').each((_i, el) => {
    totalImages++;
    const alt = $(el).attr('alt');
    if (alt && alt.trim().length > 0) withAlt++;
  });

  // Links
  let internalLinks = 0;
  let externalLinks = 0;
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    try {
      const linkUrl = new URL(href, pageUrl);
      if (linkUrl.hostname === parsedPageUrl.hostname) {
        internalLinks++;
      } else {
        externalLinks++;
      }
    } catch {
      internalLinks++; // Relative links are internal
    }
  });

  // Word count (text content of body)
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;

  // Resource hints
  const preconnect: string[] = [];
  const prefetch: string[] = [];
  const preload: string[] = [];
  $('link[rel="preconnect"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (href) preconnect.push(href);
  });
  $('link[rel="prefetch"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (href) prefetch.push(href);
  });
  $('link[rel="preload"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (href) preload.push(href);
  });

  return {
    title,
    metaDescription,
    h1,
    h2,
    canonicalUrl,
    ogTags,
    twitterTags,
    robotsMeta,
    hreflangTags,
    imageAlts: { total: totalImages, withAlt, missingAlt: totalImages - withAlt },
    internalLinks,
    externalLinks,
    wordCount,
    loadingHints: { preconnect, prefetch, preload },
  };
}
