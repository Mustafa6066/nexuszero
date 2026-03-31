import Anthropic from '@anthropic-ai/sdk';
import { retry, CircuitBreaker } from '@nexuszero/shared';

const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 60_000, halfOpenRequests: 2 });

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

async function llmCall(prompt: string, systemPrompt: string): Promise<string> {
  return breaker.execute(() =>
    retry(async () => {
      const res = await getClient().messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });
      return res.content.find(b => b.type === 'text')?.text ?? '';
    }, { maxRetries: 3, baseDelayMs: 1000 }),
  );
}

export interface MentionScore {
  sentiment: number;
  intent: 'complaint' | 'question' | 'praise' | 'comparison' | 'neutral';
  shouldEngage: boolean;
  reasoning: string;
}

export async function llmScoreMention(mentionText: string, brandContext: string): Promise<MentionScore> {
  const system = 'You are an expert social media analyst. Analyze Reddit posts for brand mentions and engagement opportunities. Respond ONLY with valid JSON.';
  const prompt = `Analyze this Reddit mention about "${brandContext}":

"${mentionText}"

Return JSON: { "sentiment": <-1 to 1>, "intent": <"complaint"|"question"|"praise"|"comparison"|"neutral">, "shouldEngage": <boolean - true if replying would genuinely help>, "reasoning": "<1 sentence>" }`;

  const raw = await llmCall(prompt, system);
  try {
    return JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '')) as MentionScore;
  } catch {
    return { sentiment: 0, intent: 'neutral', shouldEngage: false, reasoning: 'Parse error' };
  }
}

export async function llmDraftReply(mention: { postTitle: string; mentionText: string; subreddit: string }, brandVoice: string): Promise<string> {
  const system = `You are a community manager writing helpful Reddit replies. Brand voice: ${brandVoice}. Keep replies concise, genuine, and not promotional. Never reveal you are an AI or brand employee unless asked.`;
  const prompt = `Write a helpful reply to this Reddit post in r/${mention.subreddit}:

Post: "${mention.postTitle}"
Relevant excerpt: "${mention.mentionText}"

Write a reply that genuinely helps the community. 100-300 words. No markdown headers. Conversational tone.`;

  return llmCall(prompt, system);
}
