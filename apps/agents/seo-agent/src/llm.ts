import Anthropic from '@anthropic-ai/sdk';
import {
  buildSeoLanguageInstruction,
  CircuitBreaker,
  containsArabicScript,
  resolveMarketContext,
  retry,
  withSpan,
  type MarketContextInput,
} from '@nexuszero/shared';

export interface SeoMarketInput extends MarketContextInput {}

export interface SeoLlmRequest {
  operation: string;
  prompt: string;
  systemPrompt?: string;
  market?: SeoMarketInput;
}

export interface SeoLlmServiceDependencies {
  invokeModel?: (input: { prompt: string; systemPrompt: string }) => Promise<string>;
  breaker?: CircuitBreaker;
  retryImpl?: typeof retry;
}

const anthropicBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenRequests: 2,
});

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function invokeAnthropic() {
  return async ({ prompt, systemPrompt }: { prompt: string; systemPrompt: string }) => {
      const anthropic = getClient();
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text || '';
  };
}

export function createSeoLlmService(dependencies: SeoLlmServiceDependencies = {}) {
  const invokeModel = dependencies.invokeModel ?? invokeAnthropic();
  const breaker = dependencies.breaker ?? anthropicBreaker;
  const retryImpl = dependencies.retryImpl ?? retry;

  return {
    async analyze(request: SeoLlmRequest): Promise<string> {
      const market = resolveMarketContext({
        ...(request.market ?? {}),
        prompt: request.prompt,
      });

      const systemPrompt = request.systemPrompt ?? buildSeoLanguageInstruction(market);

      return withSpan('seo.llm.request', {
        tracerName: 'nexuszero.seo-agent',
        attributes: {
          'nexuszero.llm.operation': request.operation,
          'nexuszero.market.language': market.language,
          'nexuszero.market.dialect': market.dialect,
          'nexuszero.market.direction': market.direction,
        },
      }, async () => breaker.execute(async () => retryImpl(async () => invokeModel({
        prompt: request.prompt,
        systemPrompt,
      }), {
        maxRetries: 3,
        baseDelayMs: 1_000,
        maxDelayMs: 8_000,
      })));
    },
  };
}

const seoLlmService = createSeoLlmService();

export async function llmAnalyze(prompt: string, systemPrompt?: string, market?: SeoMarketInput): Promise<string> {
  return seoLlmService.analyze({ operation: 'analysis', prompt, systemPrompt, market });
}

export async function llmGenerateKeywords(context: {
  industry: string;
  domain: string;
  existingKeywords: string[];
  competitors: string[];
  market?: SeoMarketInput;
}): Promise<string[]> {
  const market = resolveMarketContext({
    ...(context.market ?? {}),
    keywords: context.existingKeywords,
    prompt: context.industry,
  });

  const prompt = `Analyze the following context and generate 20 high-value SEO keywords:
Industry: ${context.industry}
Domain: ${context.domain}
Existing keywords: ${context.existingKeywords.join(', ')}
Competitors: ${context.competitors.join(', ')}
Market language: ${market.language}
Market dialect: ${market.dialect}
Market country: ${market.countryCode ?? 'unspecified'}

Requirements:
- Model local search intent and regional phrasing, not literal translation.
- Distinguish between Modern Standard Arabic and localized dialect usage when Arabic intent exists.
- Keep Arabic keywords in Arabic script and preserve RTL readability.
- Include location-aware and transaction-ready phrasing relevant to the target market.

Return a JSON array of keyword objects with: keyword, searchVolume (estimated), difficulty (1-100), intent (informational/transactional/navigational), priority (1-5)`;

  const result = await llmAnalyze(prompt, undefined, market);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    return Array.isArray(parsed) ? parsed : parsed.keywords || [];
  } catch {
    return [];
  }
}

export async function llmOptimizeContent(content: {
  title: string;
  body: string;
  targetKeywords: string[];
  url: string;
  market?: SeoMarketInput;
}): Promise<any> {
  const market = resolveMarketContext({
    ...(content.market ?? {}),
    keywords: content.targetKeywords,
    prompt: `${content.title} ${content.body.slice(0, 250)}`,
  });

  const prompt = `Optimize this content for SEO:
URL: ${content.url}
Title: ${content.title}
Target Keywords: ${content.targetKeywords.join(', ')}
Body (first 2000 chars): ${content.body.substring(0, 2000)}

Language: ${market.language}
Dialect: ${market.dialect}

Requirements:
- Preserve local commercial intent.
- If Arabic is used, keep headings, metadata, and recommendations RTL-friendly.
- Explain where MSA should be used versus localized dialect phrasing.

Provide JSON with: optimizedTitle, metaDescription, headingStructure, keywordDensity, readabilityScore, recommendations[]`;

  const result = await llmAnalyze(prompt, undefined, market);
  try {
    return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
  } catch {
    return { raw: result };
  }
}

export async function llmTechnicalAudit(siteData: {
  url: string;
  pageSpeed?: number;
  mobileFriendly?: boolean;
  issues: string[];
  market?: SeoMarketInput;
}): Promise<any> {
  const market = resolveMarketContext({
    ...(siteData.market ?? {}),
    prompt: siteData.url,
  });

  const prompt = `Perform a technical SEO audit assessment:
URL: ${siteData.url}
Page Speed Score: ${siteData.pageSpeed || 'unknown'}
Mobile Friendly: ${siteData.mobileFriendly || 'unknown'}
Known Issues: ${siteData.issues.join('; ')}

Market language: ${market.language}

Requirements:
- Flag RTL rendering or hreflang issues when the market is Arabic.
- Call out weak Arabic metadata, slug handling, and structured-data localization when relevant.

Return JSON with: overallScore (1-100), criticalIssues[], warnings[], recommendations[], estimatedImpact`;

  const result = await llmAnalyze(prompt, undefined, market);
  try {
    return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
  } catch {
    return { raw: result };
  }
}

export function validateArabicSeoOutput(output: unknown, dialect: SeoMarketInput['dialect'] = 'msa') {
  const serialized = typeof output === 'string' ? output : JSON.stringify(output);
  const hasArabicScript = containsArabicScript(serialized);
  const dialectMarkers: Record<NonNullable<SeoMarketInput['dialect']>, RegExp> = {
    auto: /(تحسين|أفضل|عروض)/u,
    msa: /(تحسين|الكلمات المفتاحية|نتائج البحث|التحويل)/u,
    egyptian: /(دلوقتي|قريب منك|أسعار|أفضل)/u,
    gulf: /(الحين|الأفضل|عروض|سريع)/u,
    levantine: /(هلق|قريب منك|أفضل|عروض)/u,
    maghrebi: /(دابا|قريب|عروض|الأفضل)/u,
  };

  return {
    hasArabicScript,
    isRtlReady: hasArabicScript,
    isDialectAligned: dialectMarkers[dialect ?? 'auto'].test(serialized),
  };
}

export function getSeoLlmBreakerState() {
  return anthropicBreaker.getState();
}
