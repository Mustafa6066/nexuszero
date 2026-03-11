import Anthropic from '@anthropic-ai/sdk';
import { retry, CircuitBreaker } from '@nexuszero/shared';

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

export async function llmAnalyze(prompt: string, systemPrompt?: string): Promise<string> {
  return anthropicBreaker.execute(async () => {
    return retry(async () => {
      const anthropic = getClient();
      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt || 'You are an expert digital advertising strategist. Provide analysis in JSON format.',
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text || '';
    }, { maxRetries: 3, baseDelayMs: 1000 });
  });
}

export async function llmOptimizeBids(campaignData: {
  budget: any;
  currentMetrics: any;
  historicalData: any[];
  bidStrategy: string;
}): Promise<any> {
  const prompt = `Analyze ad campaign performance and recommend bid adjustments:
Budget: ${JSON.stringify(campaignData.budget)}
Current Metrics: ${JSON.stringify(campaignData.currentMetrics)}
History (last 7 days): ${JSON.stringify(campaignData.historicalData.slice(0, 7))}
Bid Strategy: ${campaignData.bidStrategy}

Return JSON: { adjustments: [{keyword, currentBid, recommendedBid, reason}], budgetRecommendation: {daily, reason}, expectedImpact: {ctrChange, cpaChange, roasChange} }`;

  const result = await llmAnalyze(prompt);
  try {
    return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
  } catch {
    return { raw: result };
  }
}

export async function llmGenerateAdCopy(context: {
  product: string;
  targetAudience: string;
  platform: string;
  keywords: string[];
  tone: string;
  brandGuidelines?: any;
}): Promise<any> {
  const prompt = `Generate ad copy variants:
Product: ${context.product}
Audience: ${context.targetAudience}
Platform: ${context.platform}
Keywords: ${context.keywords.join(', ')}
Tone: ${context.tone}
${context.brandGuidelines ? `Brand Guidelines: ${JSON.stringify(context.brandGuidelines)}` : ''}

Return JSON array of 5 variants: [{headline, description, callToAction, predictedCtr, emotionalAppeal}]`;

  const result = await llmAnalyze(prompt);
  try {
    return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
  } catch {
    return [];
  }
}

export async function llmAnalyzeAudience(data: {
  demographics: any;
  behaviors: any;
  campaignPerformance: any;
}): Promise<any> {
  const prompt = `Analyze audience data and recommend targeting optimizations:
Demographics: ${JSON.stringify(data.demographics)}
Behaviors: ${JSON.stringify(data.behaviors)}
Campaign Performance: ${JSON.stringify(data.campaignPerformance)}

Return JSON: { segments: [{name, size, ctr, conversionRate, recommendation}], lookalikes: [{source, estimatedReach}], exclusions: string[], daypartingRecommendations: [{day, hours, bidModifier}] }`;

  const result = await llmAnalyze(prompt);
  try {
    return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
  } catch {
    return { raw: result };
  }
}
