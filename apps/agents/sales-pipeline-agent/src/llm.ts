import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

export async function llmAnalyzeSales(prompt: string): Promise<string> {
  return routedCompletion({
    model: ModelPreset.FAST_ANALYSIS,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4096,
    temperature: 0.4,
  });
}

export async function llmLongFormSales(prompt: string): Promise<string> {
  return routedCompletion({
    model: ModelPreset.LONG_FORM,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 8192,
    temperature: 0.5,
  });
}
