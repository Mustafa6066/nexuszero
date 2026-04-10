import { routedCompletion } from '@nexuszero/llm-router';
import { CircuitBreaker, retry, withSpan } from '@nexuszero/shared';

const llmBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenRequests: 2,
});

export async function creativeLlm(prompt: string, systemPrompt?: string): Promise<string> {
  return withSpan('creative.llm.completion', {
    tracerName: 'nexuszero.creative-agent',
  }, async () => {
    return llmBreaker.execute(() =>
      retry(async () => {
        const result = await routedCompletion({
          model: 'auto',
          messages: [
            ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
            { role: 'user' as const, content: prompt },
          ],
          temperature: 0.7,
          maxTokens: 4096,
        });
        return result.content;
      }, { retries: 2, delayMs: 1000 })
    );
  });
}

export function parseLlmJson<T = Record<string, unknown>>(raw: string): T {
  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}
