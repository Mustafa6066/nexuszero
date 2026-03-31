/** Available models via OpenRouter */
export const OPENROUTER_MODELS = {
  // Fast / cheap
  HAIKU: 'anthropic/claude-3-5-haiku',
  GPT4O_MINI: 'openai/gpt-4o-mini',
  GEMINI_FLASH: 'google/gemini-2.5-flash-preview-05-20',
  // Balanced
  SONNET: 'anthropic/claude-sonnet-4-5',
  GPT4O: 'openai/gpt-4o',
  MISTRAL: 'mistralai/mistral-large',
  // Power
  OPUS: 'anthropic/claude-opus-4-5',
  GEMINI_PRO: 'google/gemini-2.5-pro-preview-06-05',
  DEEPSEEK: 'deepseek/deepseek-r1',
  LLAMA: 'meta-llama/llama-3.3-70b-instruct',
} as const;

export type OpenRouterModel = (typeof OPENROUTER_MODELS)[keyof typeof OPENROUTER_MODELS];

/** Preset model choices for common use cases */
export const ModelPreset = {
  FAST_ANALYSIS: OPENROUTER_MODELS.HAIKU,
  CONTENT_WRITING: OPENROUTER_MODELS.SONNET,
  LONG_FORM: OPENROUTER_MODELS.GPT4O,
  REASONING: OPENROUTER_MODELS.DEEPSEEK,
  ASSISTANT: OPENROUTER_MODELS.SONNET,
} as const;
