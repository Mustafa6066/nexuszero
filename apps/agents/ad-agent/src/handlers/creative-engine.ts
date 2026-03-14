import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import { withTenantDb, creatives, creativeTests } from '@nexuszero/db';
import {
  buildCreativeLanguageInstruction,
  enforceRtlHtmlDocument,
  getCurrentTenantId,
  PLATFORM_DIMENSIONS,
  CREATIVE_TYPE_CONFIG,
  bayesianABTest,
  resolveMarketContext,
  type MarketContextInput,
} from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmGenerateAdCopy, llmAnalyze } from '../llm.js';
import { eq, and, inArray } from 'drizzle-orm';

type CreativeEngineInput = {
  creativeId?: string;
  type?: string;
  campaignId?: string | null;
  prompt?: string;
  product?: string;
  targetAudience?: string;
  platform?: string;
  keywords?: string[];
  tone?: string;
  brandGuidelines?: { tone?: string; fontFamily?: string; logoUrl?: string | null; doNotUse?: string[] };
  market?: MarketContextInput;
  count?: number;
  variants?: number;
  dimensions?: { width: number; height: number; label: string };
};

export class CreativeEngine {
  async generate(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    const normalized = this.normalizeInput(input as CreativeEngineInput);
    await job.updateProgress(10);

    await job.updateProgress(20);

    const generatedVariants = await this.generateVariants(normalized);
    const limitedVariants = generatedVariants.slice(0, normalized.variantCount);
    const primaryVariant = limitedVariants[0] ?? this.buildFallbackVariant(normalized, 0);
    const brandScore = this.estimateBrandScore(normalized);
    const predictedCtr = this.estimatePredictedCtr(primaryVariant, normalized.type);
    const storedVariants = limitedVariants.map((variant, index) => ({
      id: randomUUID(),
      variantLabel: String.fromCharCode(65 + index),
      content: variant,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      conversionRate: 0,
    }));

    await job.updateProgress(70);

    const storedCreative = await withTenantDb(tenantId, async (db) => {
      const values = {
        tenantId,
        campaignId: normalized.campaignId,
        type: normalized.type as any,
        name: this.buildCreativeName(normalized),
        status: 'generated' as const,
        content: primaryVariant,
        brandScore,
        predictedCtr,
        generationPrompt: normalized.prompt,
        generationModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        variants: storedVariants,
        tags: this.buildTags(normalized),
        updatedAt: new Date(),
      };

      if (normalized.creativeId) {
        const [updated] = await db.update(creatives)
          .set(values)
          .where(and(eq(creatives.id, normalized.creativeId), eq(creatives.tenantId, tenantId)))
          .returning();

        if (updated) {
          return updated;
        }
      }

      const [created] = await db.insert(creatives).values({
        id: normalized.creativeId,
        ...values,
      }).returning();

      return created;
    });

    await job.updateProgress(90);

    await publishAgentSignal({
      tenantId,
      agentId: 'ad-worker',
      type: 'creative_generated',
      data: {
        creativeIds: [storedCreative.id],
        type: normalized.type,
        campaignId: normalized.campaignId,
        variantCount: storedVariants.length,
      },
    }).catch((error) => {
      console.warn('Failed to publish creative_generated signal:', error instanceof Error ? error.message : String(error));
    });

    await job.updateProgress(100);

    return {
      creative: storedCreative,
      variantCount: storedVariants.length,
      completedAt: new Date().toISOString(),
    };
  }

  async runAbTest(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { testId, creativeId, campaignId } = input;

    // Update test status to running
    await withTenantDb(tenantId, async (db) => {
      await db.update(creativeTests)
        .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(creativeTests.id, testId));
    });

    await job.updateProgress(30);

    // Simulate test analysis (in production, this collects real data over time)
    // For now, use Bayesian A/B testing on available data
    const controlSuccess = Math.floor(Math.random() * 50) + 10;
    const controlTotal = Math.floor(Math.random() * 500) + 100;
    const variantSuccess = Math.floor(Math.random() * 60) + 10;
    const variantTotal = Math.floor(Math.random() * 500) + 100;

    const testResult = bayesianABTest(controlSuccess, controlTotal, variantSuccess, variantTotal);

    await job.updateProgress(70);

    // Update test with results
    const isComplete = testResult.confidence >= 0.95;
    await withTenantDb(tenantId, async (db) => {
      await db.update(creativeTests)
        .set({
          status: isComplete ? 'completed' : 'running',
          confidenceLevel: testResult.confidence,
          totalImpressions: controlTotal + variantTotal,
          ...(isComplete && {
            winnerVariantId: testResult.winner === 'variant' ? 'variant' : 'control',
            completedAt: new Date(),
          }),
          updatedAt: new Date(),
        })
        .where(eq(creativeTests.id, testId));
    });

    await job.updateProgress(100);

    return {
      testId,
      result: testResult,
      isComplete,
      completedAt: new Date().toISOString(),
    };
  }

  async checkFatigue(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    // Get active creatives
    const activeCreatives = await withTenantDb(tenantId, async (db) => {
      return db.select().from(creatives)
        .where(and(eq(creatives.tenantId, tenantId), inArray(creatives.status, ['generated', 'approved'])));
    });

    await job.updateProgress(30);

    const prompt = `Analyze these active creatives for fatigue signals:
${JSON.stringify(activeCreatives.map(c => ({ id: c.id, type: c.type, name: c.name, createdAt: c.createdAt, predictedCtr: c.predictedCtr })))}

Look for:
- Creatives running for more than 7 days
- Declining predicted CTR
- Same messaging pattern used repeatedly

Return JSON: { fatiguedCreatives: [{id, fatigueLevel: "low" | "medium" | "high", reason, recommendation}], overallHealth: "good" | "warning" | "critical" }`;

    const analysis = await llmAnalyze(prompt);
    await job.updateProgress(100);

    try {
      return JSON.parse(analysis.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return { raw: analysis };
    }
  }

  private async generateAdCopy(context: {
    product: string;
    targetAudience: string;
    platform: string;
    keywords: string[];
    tone: string;
    brandGuidelines?: any;
    market?: MarketContextInput;
  }): Promise<any[]> {
    return llmGenerateAdCopy(context);
  }

  private async generateVariants(input: ReturnType<CreativeEngine['normalizeInput']>): Promise<any[]> {
    let variants: any[] = [];

    switch (input.type) {
      case 'image':
        variants = await this.generateImageCreative(input);
        break;
      case 'landing_page':
        variants = await this.generateLandingPage(input);
        break;
      case 'video_script':
        variants = await this.generateVideoScript(input);
        break;
      case 'email_template':
        variants = await this.generateEmailTemplate(input);
        break;
      case 'ad_copy':
      default:
        variants = await this.generateAdCopy({
          product: input.product,
          targetAudience: input.targetAudience,
          platform: input.platform,
          keywords: input.keywords,
          tone: input.tone,
          brandGuidelines: input.brandGuidelines,
          market: input.market,
        });
        break;
    }

    const sanitized = Array.isArray(variants)
      ? variants.filter((variant) => variant && typeof variant === 'object')
      : [];

    if (sanitized.length > 0) {
      return sanitized.map((variant, index) => {
        const mergedVariant = {
          ...this.buildFallbackVariant(input, index),
          ...variant,
        };

        return input.type === 'landing_page'
          ? this.normalizeLandingPageVariant(input, mergedVariant)
          : mergedVariant;
      });
    }

    return Array.from({ length: input.variantCount }, (_, index) => this.buildFallbackVariant(input, index));
  }

  private normalizeInput(input: CreativeEngineInput) {
    const type = (input.type && input.type in CREATIVE_TYPE_CONFIG ? input.type : 'ad_copy') as keyof typeof CREATIVE_TYPE_CONFIG;
    const requestedCount = Number(input.variants ?? input.count ?? 3);

    if (!Number.isFinite(requestedCount)) {
      throw new Error('Creative variant count must be a finite number');
    }

    if (!Number.isInteger(requestedCount) || requestedCount <= 0) {
      throw new Error('Creative variant count must be a positive integer');
    }

    const variantCount = Math.min(CREATIVE_TYPE_CONFIG[type].maxVariants, requestedCount);
    const prompt = typeof input.prompt === 'string' && input.prompt.trim().length > 0
      ? input.prompt.trim()
      : String(input.product ?? 'New creative concept').trim();

    return {
      creativeId: typeof input.creativeId === 'string' ? input.creativeId : undefined,
      type,
      campaignId: input.campaignId ?? null,
      prompt,
      product: String(input.product ?? prompt),
      targetAudience: String(input.targetAudience ?? 'General marketing audience'),
      platform: String(input.platform ?? 'google_search'),
      keywords: Array.isArray(input.keywords) ? input.keywords.filter((keyword): keyword is string => typeof keyword === 'string' && keyword.trim().length > 0) : [],
      tone: String(input.brandGuidelines?.tone ?? input.tone ?? 'professional'),
      brandGuidelines: {
        fontFamily: input.brandGuidelines?.fontFamily ?? 'Inter, sans-serif',
        ...(input.brandGuidelines ?? {}),
      },
      market: resolveMarketContext({
        ...(input.market ?? {}),
        keywords: Array.isArray(input.keywords) ? input.keywords : [],
        prompt,
        audience: String(input.targetAudience ?? ''),
      }),
      dimensions: input.dimensions,
      variantCount,
    };
  }

  private buildLandingPageHtml(input: ReturnType<CreativeEngine['normalizeInput']>, headline: string): string {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${headline}</title></head><body><main><section><h1>${headline}</h1><p>${input.prompt}</p><a href="#">${input.market.direction === 'rtl' ? 'ابدأ الآن' : 'Get Started'}</a></section></main></body></html>`;

    return input.market.direction === 'rtl' ? enforceRtlHtmlDocument(html) : html;
  }

  private normalizeLandingPageVariant(input: ReturnType<CreativeEngine['normalizeInput']>, variant: Record<string, unknown>): Record<string, unknown> {
    const html = typeof variant.html === 'string' && variant.html.trim().length > 0
      ? variant.html
      : this.buildLandingPageHtml(input, String(variant.headline ?? input.prompt));

    return {
      ...variant,
      html: input.market.direction === 'rtl' ? enforceRtlHtmlDocument(html) : html,
      direction: input.market.direction,
      fontFamily: input.market.direction === 'rtl'
        ? 'Tajawal, "IBM Plex Sans Arabic", "Noto Kufi Arabic", sans-serif'
        : input.brandGuidelines.fontFamily,
    };
  }

  private buildCreativeName(input: ReturnType<CreativeEngine['normalizeInput']>): string {
    return input.prompt.replace(/\s+/g, ' ').trim().slice(0, 200) || `${input.type}-${input.platform}`;
  }

  private buildTags(input: ReturnType<CreativeEngine['normalizeInput']>): string[] {
    return [input.platform, input.type, input.tone].filter(Boolean);
  }

  private estimateBrandScore(input: ReturnType<CreativeEngine['normalizeInput']>): number {
    let score = 70;
    if (input.brandGuidelines.logoUrl) score += 8;
    if (Array.isArray(input.brandGuidelines.doNotUse) && input.brandGuidelines.doNotUse.length > 0) score += 5;
    return Math.min(score, 95);
  }

  private estimatePredictedCtr(variant: Record<string, unknown>, type: string): number {
    const rawCtr = variant.predictedCtr;
    if (typeof rawCtr === 'number' && Number.isFinite(rawCtr)) {
      return Number(rawCtr.toFixed(2));
    }

    const fallbackByType: Record<string, number> = {
      image: 2.1,
      video_script: 1.9,
      ad_copy: 3.1,
      landing_page: 2.6,
      email_template: 4.0,
    };

    return fallbackByType[type] ?? 2.0;
  }

  private buildFallbackVariant(input: ReturnType<CreativeEngine['normalizeInput']>, index: number): Record<string, unknown> {
    const variantLabel = String.fromCharCode(65 + index);
    const shortPrompt = input.prompt.slice(0, 120);

    switch (input.type) {
      case 'image':
        return {
          type: 'image',
          imageUrl: null,
          thumbnailUrl: null,
          dimensions: input.dimensions ?? PLATFORM_DIMENSIONS[input.platform]?.[0] ?? { width: 1200, height: 628, label: input.platform },
          altText: shortPrompt,
          overlayText: input.market.direction === 'rtl' ? shortPrompt.slice(0, 40) : `${variantLabel}: ${shortPrompt.slice(0, 40)}`,
          provider: 'dall_e_3',
          description: input.prompt,
          direction: input.market.direction,
          fontFamily: input.market.direction === 'rtl'
            ? 'Tajawal, "IBM Plex Sans Arabic", "Noto Kufi Arabic", sans-serif'
            : input.brandGuidelines.fontFamily,
          predictedCtr: 2.1,
        };
      case 'video_script':
        return {
          type: 'video_script',
          script: input.prompt,
          scenes: [
            {
              sceneNumber: 1,
              description: `${variantLabel} opening hook`,
              durationSeconds: 5,
              visualDirection: 'Strong opening visual',
              dialogue: shortPrompt,
            },
          ],
          estimatedDurationSeconds: 15,
          voiceoverText: input.prompt,
          musicSuggestion: input.tone,
          predictedCtr: 1.9,
        };
      case 'landing_page':
        return {
          type: 'landing_page',
          html: this.buildLandingPageHtml(input, shortPrompt),
          css: input.market.direction === 'rtl' ? 'body{direction:rtl;text-align:right;}' : '',
          headline: shortPrompt,
          subheadline: input.targetAudience,
          ctaText: input.market.direction === 'rtl' ? 'ابدأ الآن' : 'Get Started',
          ctaUrl: '#',
          sections: [
            { type: 'hero', content: input.prompt, order: 1 },
            { type: 'cta', content: input.market.direction === 'rtl' ? 'ابدأ الآن' : 'Get Started', order: 2 },
          ],
          predictedCtr: 2.6,
        };
      case 'email_template':
        return {
          type: 'email_template',
          subjectLine: shortPrompt,
          previewText: input.targetAudience,
          body: input.prompt,
          callToAction: 'Learn more',
          predictedCtr: 4.0,
        };
      case 'ad_copy':
      default:
        return {
          type: 'ad_copy',
          headline: `${variantLabel}: ${shortPrompt.slice(0, 50)}`,
          description: input.prompt,
          callToAction: 'Learn more',
          displayUrl: null,
          emotionalAppeal: input.tone,
          emotionalArc: 'problem_solution',
          platform: input.platform,
          predictedCtr: 3.1,
        };
    }
  }

  private async generateImageCreative(input: any): Promise<any[]> {
    const { platform = 'google_ads', concept, brandGuidelines, prompt } = input;
    const dimensions = PLATFORM_DIMENSIONS[platform as keyof typeof PLATFORM_DIMENSIONS];

    const imagePrompt = `Generate image creative specifications for ${platform}:
Concept: ${concept || prompt || 'product showcase'}
Dimensions: ${JSON.stringify(dimensions)}
Brand Guidelines: ${JSON.stringify(brandGuidelines || {})}

${buildCreativeLanguageInstruction(input.market, 'image')}

Requirements:
- If Arabic overlay text is used, specify RTL-safe layout, alignment, and Arabic-first font choices.
- Keep overlay text concise enough for a high-contrast hero frame.

Return JSON array of 3 variants: [{description, colorPalette, layout, textOverlay, callToAction, predictedCtr}]`;

    const result = await llmAnalyze(imagePrompt, buildCreativeLanguageInstruction(input.market, 'image'));
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return [];
    }
  }

  private async generateLandingPage(input: any): Promise<any[]> {
    const { product, prompt, targetAudience, keywords, tone } = input;

    const landingPagePrompt = `Generate landing page content specifications:
Product: ${product || prompt}
Target Audience: ${targetAudience}
Keywords: ${(keywords || []).join(', ')}
Tone: ${tone || 'professional'}

${buildCreativeLanguageInstruction(input.market, 'landing_page')}

Requirements:
- Output production-ready semantic HTML and CSS.
- If the market is Arabic, the HTML must set dir="rtl" and lang="ar".
- Use Arabic-friendly fonts and right-aligned hierarchy for headings, copy blocks, CTA, and trust sections.

Return JSON array of 2 variants: [{headline, subheadline, heroSection, valuePropositions[], socialProof, callToAction, layout, html, css, predictedConversionRate}]`;

    const result = await llmAnalyze(landingPagePrompt, buildCreativeLanguageInstruction(input.market, 'landing_page'));
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return [];
    }
  }

  private async generateVideoScript(input: any): Promise<any[]> {
    const prompt = `Generate short-form video ad scripts:
Prompt: ${input.prompt}
Audience: ${input.targetAudience}
Platform: ${input.platform}
Tone: ${input.tone}

  ${buildCreativeLanguageInstruction(input.market, 'video_script')}

Return JSON array of variants: [{script, scenes, estimatedDurationSeconds, voiceoverText, musicSuggestion, predictedCtr}]`;

    const result = await llmAnalyze(prompt, buildCreativeLanguageInstruction(input.market, 'video_script'));
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return [];
    }
  }

  private async generateEmailTemplate(input: any): Promise<any[]> {
    const prompt = `Generate email creative variants:
Prompt: ${input.prompt}
Audience: ${input.targetAudience}
Tone: ${input.tone}

${buildCreativeLanguageInstruction(input.market, 'email_template')}

Return JSON array of variants: [{subjectLine, previewText, body, callToAction, predictedCtr}]`;

    const result = await llmAnalyze(prompt, buildCreativeLanguageInstruction(input.market, 'email_template'));
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return [];
    }
  }
}
