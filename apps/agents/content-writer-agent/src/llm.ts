import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';
import type { WebSearchResult } from '@nexuszero/prober';

export interface ContentBrief {
  topic: string;
  tone?: string;
  targetAudience?: string;
  keywords?: string[];
  wordCount?: number;
  platform?: string;
}

export async function llmWriteBlogPost(brief: ContentBrief, researchContext: WebSearchResult[]): Promise<{ title: string; content: string }> {
  const researchSnippet = researchContext.length > 0
    ? `\n\nResearch context:\n${researchContext.map(r => `- ${r.title}: ${r.snippet}`).join('\n')}`
    : '';

  const systemPrompt = `You are an expert content writer specializing in SEO-optimized blog posts. Write engaging, informative content that ranks well and genuinely helps readers. Use markdown formatting.`;

  const prompt = `Write a comprehensive blog post about: "${brief.topic}"

Tone: ${brief.tone || 'professional'}
Target audience: ${brief.targetAudience || 'general readers'}
Keywords to include: ${(brief.keywords || []).join(', ') || 'none specified'}
Target word count: ${brief.wordCount || 1500} words${researchSnippet}

Return JSON: { "title": "<SEO-optimized title>", "content": "<full markdown content>" }`;

  const raw = await routedCompletion({
    model: ModelPreset.LONG_FORM,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
    maxTokens: 8192,
    temperature: 0.7,
  });

  try {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as { title: string; content: string };
  } catch {
    // If JSON parse fails, treat raw as content
    return { title: brief.topic, content: raw };
  }
}

export async function llmWriteSocialCopy(brief: ContentBrief): Promise<Record<string, string>> {
  const systemPrompt = 'You are a social media copywriter. Write platform-optimized posts that drive engagement.';
  const prompt = `Write social media posts about: "${brief.topic}"
Tone: ${brief.tone || 'engaging'}
Keywords: ${(brief.keywords || []).join(', ')}

Return JSON with platform keys: { "twitter": "<280 chars max>", "linkedin": "<1300 chars max, professional>", "instagram": "<caption with hashtags>", "facebook": "<engaging post>" }`;

  const raw = await routedCompletion({
    model: ModelPreset.CONTENT_WRITING,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
    maxTokens: 2048,
    temperature: 0.8,
  });

  try {
    return JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()) as Record<string, string>;
  } catch {
    return { twitter: raw.slice(0, 280) };
  }
}

export async function llmWriteEmail(brief: ContentBrief): Promise<{ subjectLines: string[]; previewText: string; htmlBody: string }> {
  const systemPrompt = 'You are an email marketing expert. Write high-converting email campaigns.';
  const prompt = `Write an email about: "${brief.topic}"
Tone: ${brief.tone || 'professional'}
Audience: ${brief.targetAudience || 'subscribers'}

Return JSON: { "subjectLines": ["<A variant>", "<B variant>"], "previewText": "<preview snippet>", "htmlBody": "<full HTML email>" }`;

  const raw = await routedCompletion({
    model: ModelPreset.CONTENT_WRITING,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
    maxTokens: 4096,
    temperature: 0.7,
  });

  try {
    return JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()) as { subjectLines: string[]; previewText: string; htmlBody: string };
  } catch {
    return { subjectLines: [brief.topic], previewText: '', htmlBody: raw };
  }
}

export async function llmScoreContent(content: string, keywords: string[]): Promise<{ seoScore: number; readabilityScore: number; suggestions: string[] }> {
  const systemPrompt = 'You are an SEO and content quality expert. Score content objectively. Return only JSON.';
  const prompt = `Score this content:

Keywords to target: ${keywords.join(', ')}

Content (first 2000 chars): "${content.slice(0, 2000)}"

Return JSON: { "seoScore": <0-100>, "readabilityScore": <0-100>, "suggestions": ["<improvement 1>", "<improvement 2>"] }`;

  const raw = await routedCompletion({
    model: ModelPreset.FAST_ANALYSIS,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
    maxTokens: 512,
    temperature: 0.3,
  });

  try {
    return JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()) as { seoScore: number; readabilityScore: number; suggestions: string[] };
  } catch {
    return { seoScore: 50, readabilityScore: 50, suggestions: [] };
  }
}
