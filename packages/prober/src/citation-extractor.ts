import type { ProbeResult } from './providers/base-prober.js';

export interface ExtractedCitation {
  /** URL found in the response */
  url: string;
  /** Surrounding text context */
  context: string;
  /** Whether this URL matches the brand's known domains */
  isBrandMention: boolean;
  /** Competitor domains found in the same response */
  competitorUrls: string[];
}

export interface CitationAnalysis {
  provider: string;
  query: string;
  /** All URLs extracted from the response */
  citations: ExtractedCitation[];
  /** Whether the entity/brand is mentioned by name (even without a URL) */
  brandNameMentioned: boolean;
  /** Sentiment towards the brand in this response (-1 to 1) */
  estimatedSentiment: number;
  /** Raw response for downstream LLM post-processing */
  responseText: string;
}

const URL_REGEX = /https?:\/\/[^\s"'<>\])\},]+/gi;

/**
 * Extract citations and brand mentions from a probe result.
 * This is a deterministic extraction layer — no LLM calls.
 * The LLM judge step lives in CitationScanHandler.
 */
export function extractCitations(
  probeResult: ProbeResult,
  query: string,
  brandDomains: string[],
  brandNames: string[],
  competitorDomains: string[],
): CitationAnalysis {
  const text = probeResult.responseText;
  const urls = extractUrls(text);
  const lowerText = text.toLowerCase();

  // Classify each URL
  const citations: ExtractedCitation[] = urls.map(url => {
    const urlLower = url.toLowerCase();
    const isBrandMention = brandDomains.some(d => urlLower.includes(d.toLowerCase()));
    const competitorUrls = competitorDomains.filter(d => urlLower.includes(d.toLowerCase()));
    const context = extractContext(text, url, 100);

    return { url, context, isBrandMention, competitorUrls };
  });

  // Also add Perplexity-style structured citations
  for (const structuredUrl of probeResult.citations) {
    if (!urls.includes(structuredUrl)) {
      const urlLower = structuredUrl.toLowerCase();
      const isBrandMention = brandDomains.some(d => urlLower.includes(d.toLowerCase()));
      const competitorUrls = competitorDomains.filter(d => urlLower.includes(d.toLowerCase()));
      citations.push({ url: structuredUrl, context: '(structured citation)', isBrandMention, competitorUrls });
    }
  }

  // Brand name mention check (fuzzy)
  const brandNameMentioned = brandNames.some(name =>
    lowerText.includes(name.toLowerCase()),
  );

  // Simple sentiment heuristic based on surrounding context
  const estimatedSentiment = estimateSentiment(text, brandNames);

  return {
    provider: probeResult.provider,
    query,
    citations,
    brandNameMentioned,
    estimatedSentiment,
    responseText: text,
  };
}

/** Extract all URLs from text, deduplicating */
function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  // Clean trailing punctuation from URLs
  const cleaned = matches.map(url =>
    url.replace(/[.,;:!?)}\]]+$/, ''),
  );
  return [...new Set(cleaned)];
}

/** Extract surrounding context for a URL mention */
function extractContext(text: string, url: string, charRadius: number): string {
  const idx = text.indexOf(url);
  if (idx === -1) return '';
  const start = Math.max(0, idx - charRadius);
  const end = Math.min(text.length, idx + url.length + charRadius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

/** Simple rule-based sentiment estimation (-1 to 1) */
function estimateSentiment(text: string, brandNames: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;

  const positiveTerms = ['recommend', 'best', 'excellent', 'leading', 'top-rated', 'trusted', 'popular', 'great choice'];
  const negativeTerms = ['avoid', 'poor', 'worst', 'issue', 'problem', 'complaint', 'scam', 'unreliable'];

  for (const name of brandNames) {
    const nameLower = name.toLowerCase();
    // Find sentences containing the brand name
    const sentences = lower.split(/[.!?]+/).filter(s => s.includes(nameLower));
    for (const sentence of sentences) {
      for (const term of positiveTerms) {
        if (sentence.includes(term)) score += 0.15;
      }
      for (const term of negativeTerms) {
        if (sentence.includes(term)) score -= 0.15;
      }
    }
  }

  return Math.max(-1, Math.min(1, score));
}
