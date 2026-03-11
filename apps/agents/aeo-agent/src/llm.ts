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
        system: systemPrompt || 'You are an expert in AI Engine Optimization (AEO) — optimizing brands for visibility in AI-powered search and answer engines. Provide precise analysis in JSON format.',
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text || '';
    }, { maxRetries: 3, baseDelayMs: 1000 });
  });
}

export async function llmAnalyzeCitations(data: {
  entityName: string;
  queries: string[];
  existingCitations: Array<{ platform: string; query: string; position: number | null; citationText: string | null }>;
}): Promise<Array<{
  platform: string;
  query: string;
  citationUrl: string | null;
  citationText: string;
  position: number;
  isBrandMention: boolean;
  sentiment: number;
  competitorsCited: string[];
}>> {
  const prompt = `Analyze AI citation opportunities for the following entity:

Entity: ${data.entityName}
Target Queries: ${data.queries.join(', ')}

Existing Citations (${data.existingCitations.length}):
${data.existingCitations.slice(0, 10).map(c => `  Platform: ${c.platform}, Query: "${c.query}", Position: ${c.position ?? 'N/A'}`).join('\n')}

For each query-platform combination, predict the likely citation behavior of AI answer engines.
Return a JSON array of objects with: platform (chatgpt|perplexity|google_ai_overview|gemini|bing_copilot|claude), query, citationUrl (null if no citation), citationText, position (1-10, lower is better), isBrandMention (boolean), sentiment (-1 to 1), competitorsCited (string[])`;

  const result = await llmAnalyze(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    return Array.isArray(parsed) ? parsed : parsed.citations || [];
  } catch {
    return [];
  }
}

export async function llmGenerateSchemaMarkup(entity: {
  entityName: string;
  entityType: string;
  description: string | null;
  attributes: Record<string, unknown> | null;
  targetPlatforms: string[];
}): Promise<{ schemaJson: Record<string, unknown>; recommendations: string[] }> {
  const prompt = `Generate optimized JSON-LD schema markup for this entity to maximize visibility in AI answer engines:

Entity Name: ${entity.entityName}
Entity Type: ${entity.entityType}
Description: ${entity.description || 'N/A'}
Attributes: ${JSON.stringify(entity.attributes || {}, null, 2)}
Target AI Platforms: ${entity.targetPlatforms.join(', ')}

Generate comprehensive JSON-LD schema markup following schema.org standards, optimized for AI crawlers.
Return JSON with: schemaJson (the actual JSON-LD object), recommendations (string[] of additional optimization tips)`;

  const result = await llmAnalyze(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    return {
      schemaJson: parsed.schemaJson || parsed.schema || {},
      recommendations: parsed.recommendations || [],
    };
  } catch {
    return { schemaJson: {}, recommendations: ['Failed to generate schema. Please retry.'] };
  }
}

export async function llmScoreVisibility(data: {
  entityName: string;
  platform: string;
  citations: Array<{ query: string; position: number | null; isBrandMention: boolean; sentiment: number | null }>;
  entityProfile: { schemaMarkupStatus: string; attributes: Record<string, unknown> | null };
}): Promise<{
  overallScore: number;
  citationFrequency: number;
  sentimentScore: number;
  contentRelevance: number;
  entityClarity: number;
  recommendations: string[];
}> {
  const prompt = `Score AI visibility for the following entity on ${data.platform}:

Entity: ${data.entityName}
Schema Markup Status: ${data.entityProfile.schemaMarkupStatus}
Total Citations Found: ${data.citations.length}
Brand Mentions: ${data.citations.filter(c => c.isBrandMention).length}
Average Position: ${data.citations.filter(c => c.position != null).reduce((s, c) => s + (c.position ?? 0), 0) / Math.max(data.citations.filter(c => c.position != null).length, 1)}
Average Sentiment: ${data.citations.filter(c => c.sentiment != null).reduce((s, c) => s + (c.sentiment ?? 0), 0) / Math.max(data.citations.filter(c => c.sentiment != null).length, 1)}

Score each dimension from 0-100:
Return JSON with: overallScore, citationFrequency, sentimentScore, contentRelevance, entityClarity, recommendations (string[])`;

  const result = await llmAnalyze(prompt);
  try {
    const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
    return {
      overallScore: parsed.overallScore || 0,
      citationFrequency: parsed.citationFrequency || 0,
      sentimentScore: parsed.sentimentScore || 0,
      contentRelevance: parsed.contentRelevance || 0,
      entityClarity: parsed.entityClarity || 0,
      recommendations: parsed.recommendations || [],
    };
  } catch {
    return { overallScore: 0, citationFrequency: 0, sentimentScore: 0, contentRelevance: 0, entityClarity: 0, recommendations: [] };
  }
}
