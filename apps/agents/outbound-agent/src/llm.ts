import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

export async function llmOutbound(prompt: string): Promise<string> {
  return routedCompletion({
    model: ModelPreset.CONTENT_WRITING,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4096,
    temperature: 0.7,
  });
}
