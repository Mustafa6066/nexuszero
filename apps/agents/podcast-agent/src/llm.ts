import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

export async function llmPodcast(prompt: string): Promise<string> {
  return routedCompletion({
    model: ModelPreset.FAST_ANALYSIS,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4096,
    temperature: 0.4,
    systemPrompt: 'You are a podcast content strategist and producer. Extract actionable insights and create engaging derivative content from podcast material. Always output valid JSON when requested.',
  });
}

export async function llmPodcastLongForm(prompt: string): Promise<string> {
  return routedCompletion({
    model: ModelPreset.LONG_FORM,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 8192,
    temperature: 0.5,
    systemPrompt: 'You are a podcast content strategist creating long-form derivative content from podcast episodes. Write engaging, platform-native content.',
  });
}
