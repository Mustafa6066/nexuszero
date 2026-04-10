import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

export async function llmFinance(prompt: string): Promise<string> {
  return routedCompletion({
    model: ModelPreset.FAST_ANALYSIS,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4096,
    temperature: 0.3,
    systemPrompt: 'You are an expert CFO-level financial analyst. Provide precise, data-driven financial analysis and recommendations. Always output valid JSON when requested.',
  });
}

export async function llmFinanceLongForm(prompt: string): Promise<string> {
  return routedCompletion({
    model: ModelPreset.LONG_FORM,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 8192,
    temperature: 0.4,
    systemPrompt: 'You are an expert CFO-level financial analyst producing executive-ready briefings and scenario analyses. Be thorough but actionable.',
  });
}
