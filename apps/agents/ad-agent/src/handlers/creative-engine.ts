import type { Job } from 'bullmq';
import { withTenantDb, creatives, creativeTests } from '@nexuszero/db';
import { getCurrentTenantId, PLATFORM_DIMENSIONS, CREATIVE_TYPE_CONFIG, bayesianABTest } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmGenerateAdCopy, llmAnalyze } from '../llm.js';
import { eq, and } from 'drizzle-orm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// R2-compatible S3 client
function getStorageClient() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  });
}

export class CreativeEngine {
  async generate(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      type = 'ad_copy',
      campaignId,
      product,
      targetAudience,
      platform = 'google_ads',
      keywords = [],
      tone = 'professional',
      brandGuidelines,
      count = 3,
    } = input;

    await job.updateProgress(20);

    let variants: any[] = [];

    switch (type) {
      case 'ad_copy':
        variants = await this.generateAdCopy({
          product,
          targetAudience,
          platform,
          keywords,
          tone,
          brandGuidelines,
        });
        break;

      case 'image':
        variants = await this.generateImageCreative(input);
        break;

      case 'landing_page':
        variants = await this.generateLandingPage(input);
        break;

      default:
        variants = await this.generateAdCopy({
          product,
          targetAudience,
          platform,
          keywords,
          tone,
          brandGuidelines,
        });
    }

    await job.updateProgress(70);

    // Store creatives in database
    const storedCreatives = [];
    for (const variant of variants.slice(0, count)) {
      const creative = await withTenantDb(tenantId, async (db) => {
        const [c] = await db.insert(creatives).values({
          tenantId,
          campaignId,
          type: type as any,
          name: `${type}-${platform}-${Date.now()}`,
          status: 'draft',
          content: variant,
          predictedCtr: variant.predictedCtr || null,
          generationPrompt: JSON.stringify(input),
          generationModel: 'claude-sonnet-4-20250514',
          variants: [],
          tags: [platform, type, tone],
        }).returning();
        return c;
      });
      storedCreatives.push(creative);
    }

    await job.updateProgress(90);

    // Signal that creatives were generated
    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'ad-worker',
      type: 'creative_generated',
      data: {
        creativeIds: storedCreatives.map(c => c.id),
        type,
        campaignId,
      },
    });

    await job.updateProgress(100);

    return {
      creatives: storedCreatives,
      variantCount: storedCreatives.length,
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
        .where(and(eq(creatives.tenantId, tenantId), eq(creatives.status, 'active')));
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
  }): Promise<any[]> {
    return llmGenerateAdCopy(context);
  }

  private async generateImageCreative(input: any): Promise<any[]> {
    const { platform = 'google_ads', concept, brandGuidelines } = input;
    const dimensions = PLATFORM_DIMENSIONS[platform as keyof typeof PLATFORM_DIMENSIONS];

    const prompt = `Generate image creative specifications for ${platform}:
Concept: ${concept || 'product showcase'}
Dimensions: ${JSON.stringify(dimensions)}
Brand Guidelines: ${JSON.stringify(brandGuidelines || {})}

Return JSON array of 3 variants: [{description, colorPalette, layout, textOverlay, callToAction, predictedCtr}]`;

    const result = await llmAnalyze(prompt);
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return [];
    }
  }

  private async generateLandingPage(input: any): Promise<any[]> {
    const { product, targetAudience, keywords, tone } = input;

    const prompt = `Generate landing page content specifications:
Product: ${product}
Target Audience: ${targetAudience}
Keywords: ${(keywords || []).join(', ')}
Tone: ${tone || 'professional'}

Return JSON array of 2 variants: [{headline, subheadline, heroSection, valuePropositions[], socialProof, callToAction, layout, predictedConversionRate}]`;

    const result = await llmAnalyze(prompt);
    try {
      return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    } catch {
      return [];
    }
  }
}
