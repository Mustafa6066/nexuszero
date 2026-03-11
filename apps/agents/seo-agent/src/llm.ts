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
        system: systemPrompt || 'You are an expert SEO analyst. Provide concise, actionable analysis in JSON format.',
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text || '';
    }, { maxRetries: 3, baseDelayMs: 1000 });
  });
}

export async function llmGenerateKeywords(context: {
  industry: string;
  domain: string;
  existingKeywords: string[];
  competitors: string[];
}): Promise<string[]> {
  const prompt = `Analyze the following context and generate 20 high-value SEO keywords:
Industry: ${context.industry}
Domain: ${context.domain}
Existing keywords: ${context.existingKeywords.join(', ')}
Competitors: ${context.competitors.join(', ')}

Return a JSON array of keyword objects with: keyword, searchVolume (estimated), difficulty (1-100), intent (informational/transactional/navigational), priority (1-5)`;

  const result = await llmAnalyze(prompt);
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
}): Promise<any> {
  const prompt = `Optimize this content for SEO:
URL: ${content.url}
Title: ${content.title}
Target Keywords: ${content.targetKeywords.join(', ')}
Body (first 2000 chars): ${content.body.substring(0, 2000)}

Provide JSON with: optimizedTitle, metaDescription, headingStructure, keywordDensity, readabilityScore, recommendations[]`;

  const result = await llmAnalyze(prompt);
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
}): Promise<any> {
  const prompt = `Perform a technical SEO audit assessment:
URL: ${siteData.url}
Page Speed Score: ${siteData.pageSpeed || 'unknown'}
Mobile Friendly: ${siteData.mobileFriendly || 'unknown'}
Known Issues: ${siteData.issues.join('; ')}

Return JSON with: overallScore (1-100), criticalIssues[], warnings[], recommendations[], estimatedImpact`;

  const result = await llmAnalyze(prompt);
  try {
    return JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, ''));
  } catch {
    return { raw: result };
  }
}
