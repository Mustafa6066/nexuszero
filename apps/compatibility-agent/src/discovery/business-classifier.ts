/**
 * Business Classifier — LLM-powered classification of a website's business type.
 * Uses page content + detected tech stack as signals to classify into:
 * e-commerce, saas, agency, local-business, media, non-profit, marketplace, other
 */

import { routedCompletion } from '@nexuszero/llm-router';
import type { DetectedTechnology } from '@nexuszero/shared';

export type BusinessType =
  | 'e-commerce'
  | 'saas'
  | 'agency'
  | 'local-business'
  | 'media'
  | 'non-profit'
  | 'marketplace'
  | 'other';

const VALID_TYPES = new Set<BusinessType>([
  'e-commerce', 'saas', 'agency', 'local-business', 'media', 'non-profit', 'marketplace', 'other',
]);

/**
 * Classify a website's business type using LLM analysis of:
 * - Page HTML content (stripped to text)
 * - Detected tech stack
 * - URL patterns
 */
export async function classifyBusiness(
  html: string,
  detections: DetectedTechnology[],
  url: string,
): Promise<BusinessType | null> {
  // First try rule-based heuristics (fast, no LLM cost)
  const heuristicResult = classifyByHeuristics(html, detections, url);
  if (heuristicResult) return heuristicResult;

  // Fall back to LLM classification for ambiguous cases
  return classifyByLlm(html, detections, url);
}

// ── Rule-based heuristics ───────────────────────────────────────────────────

function classifyByHeuristics(
  html: string,
  detections: DetectedTechnology[],
  url: string,
): BusinessType | null {
  const lowerHtml = html.toLowerCase();
  const platforms = new Set(detections.map((d) => d.platform));
  const categories = new Set(detections.map((d) => (d as any).category));

  // Strong e-commerce signals
  const hasEcommerceCms = platforms.has('shopify' as any) || platforms.has('woocommerce' as any) ||
    platforms.has('magento' as any) || platforms.has('bigcommerce' as any);
  const hasCart = /add.to.cart|shopping.cart|checkout|buy.now|add-to-bag/i.test(lowerHtml);
  const hasProductSchema = /\"@type\"\s*:\s*\"Product\"/i.test(html) ||
    /itemtype.*schema\.org\/Product/i.test(html);
  if (hasEcommerceCms || (hasCart && hasProductSchema)) return 'e-commerce';

  // Strong SaaS signals
  const hasSaasSignals = /pricing|free.trial|sign.up.free|start.your.trial|request.a.demo|get.started.free/i.test(lowerHtml);
  const hasAppLogin = /app\.\w+\.com|dashboard\.|\/(app|login|signup|register)\b/i.test(lowerHtml);
  const hasSaasPricing = /\/month|\/year|per.seat|per.user|enterprise.plan/i.test(lowerHtml);
  if (hasSaasSignals && (hasAppLogin || hasSaasPricing)) return 'saas';

  // Strong agency signals
  const hasAgencySignals = /our.work|portfolio|case.stud(y|ies)|our.clients|services.we.offer|we.help.brands/i.test(lowerHtml);
  const hasAgencyServices = /web.design|branding|digital.marketing|seo.services|social.media.management|content.strategy/i.test(lowerHtml);
  if (hasAgencySignals && hasAgencyServices) return 'agency';

  // Strong local business signals
  const hasLocalSignals = /our.location|visit.us|store.hours|opening.hours|directions|map/i.test(lowerHtml);
  const hasLocalSchema = /\"@type\"\s*:\s*\"(LocalBusiness|Restaurant|Store|MedicalBusiness)\"/i.test(html);
  const hasPhysicalAddress = /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)\b/i.test(lowerHtml);
  if (hasLocalSchema || (hasLocalSignals && hasPhysicalAddress)) return 'local-business';

  // Strong media/publisher signals
  const hasMediaSignals = /subscribe.to.our.newsletter|latest.articles|read.more|published.on|by.[\w\s]+\|/i.test(lowerHtml);
  const hasArticleSchema = /\"@type\"\s*:\s*\"(Article|NewsArticle|BlogPosting)\"/i.test(html);
  const highArticleCount = (lowerHtml.match(/<article/gi) ?? []).length > 5;
  if (hasArticleSchema && (hasMediaSignals || highArticleCount)) return 'media';

  // Marketplace signals
  const hasMarketplace = /sell.on|become.a.seller|vendor.sign.up|list.your|browse.sellers/i.test(lowerHtml);
  if (hasMarketplace && hasCart) return 'marketplace';

  // Non-profit signals
  const hasNonProfit = /donate|donation|501\(c\)|non.?profit|charity|our.mission|make.a.difference/i.test(lowerHtml);
  const hasDonateButton = /donate.now|give.now|support.us|contribute/i.test(lowerHtml);
  if (hasNonProfit && hasDonateButton) return 'non-profit';

  return null; // Ambiguous — defer to LLM
}

// ── LLM classification ──────────────────────────────────────────────────────

async function classifyByLlm(
  html: string,
  detections: DetectedTechnology[],
  url: string,
): Promise<BusinessType | null> {
  // Extract representative text from HTML (limit to ~2000 chars to control cost)
  const textContent = extractTextContent(html).slice(0, 2000);
  const stackSummary = detections.map((d) => `${d.name} (${(d as any).category ?? 'unknown'})`).join(', ');

  const prompt = `Classify the business type of this website based on the page content and tech stack.

URL: ${url}
Detected Tech Stack: ${stackSummary || 'None detected'}

Page Content (excerpt):
${textContent}

Respond with ONLY one of these exact values:
e-commerce, saas, agency, local-business, media, non-profit, marketplace, other

Your answer:`;

  try {
    const result = await routedCompletion({
      messages: [{ role: 'user', content: prompt }],
      preset: 'fast',
      maxTokens: 10,
      temperature: 0,
    });

    const answer = (result.content ?? '').trim().toLowerCase().replace(/[^a-z-]/g, '') as BusinessType;
    return VALID_TYPES.has(answer) ? answer : 'other';
  } catch {
    return null;
  }
}

function extractTextContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
