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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });
      return res.content.find(b => b.type === 'text')?.text ?? '';
    }, { maxRetries: 3, baseDelayMs: 1000 }),
  );
}

export interface SocialScore {
  sentiment: number;
  intent: string;
  engagementScore: number;
  shouldEngage: boolean;
}

export async function llmScoreSocialMention(content: string, platform: string, brandKeywords: string[]): Promise<SocialScore> {
  const system = 'You are a social media analyst. Score brand mentions for engagement value. Return only JSON.';
  const prompt = `Score this ${platform} mention about "${brandKeywords.join(', ')}":

"${content.slice(0, 500)}"

Return JSON: { "sentiment": <-1 to 1>, "intent": "<complaint|question|praise|comparison|neutral>", "engagementScore": <0-1, based on reach potential>, "shouldEngage": <boolean> }`;

  try {
    const raw = await llmCall(prompt, system);
    return JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '')) as SocialScore;
  } catch {
    return { sentiment: 0, intent: 'neutral', engagementScore: 0, shouldEngage: false };
  }
}

export async function llmDraftTweet(mention: { content: string; authorHandle: string }, brandVoice: string): Promise<string> {
  const system = `You are a social media community manager. Brand voice: ${brandVoice}. Write Twitter replies under 280 characters. Be genuine and helpful.`;
  const prompt = `Write a reply to @${mention.authorHandle}:

"${mention.content.slice(0, 300)}"

Reply (max 280 chars, no hashtags spam):`;

  const reply = await llmCall(prompt, system);
  return reply.slice(0, 280);
}
