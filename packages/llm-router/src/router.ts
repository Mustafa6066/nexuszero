import OpenAI from 'openai';
import { CircuitBreaker, scanForInjection, sanitizePromptInput } from '@nexuszero/shared';
import { OPENROUTER_MODELS } from './models.js';
import { trackCompletion } from './cost-tracker.js';

export interface CompletionRequest {
  /** Model to use, e.g. 'anthropic/claude-sonnet-4-5' */
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  /** Agent type for cost attribution (auto-detected from tenant context if omitted) */
  agentType?: string;
  /** Task ID for cost attribution */
  taskId?: string;
}

/** Extended result exposing token counts for budget tracking */
export interface CompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  durationMs: number;
}

let client: OpenAI | null = null;

// Per-model circuit breakers
const breakers = new Map<string, CircuitBreaker>();

function getBreaker(model: string): CircuitBreaker {
  if (!breakers.has(model)) {
    breakers.set(model, new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 60_000, halfOpenRequests: 2 }));
  }
  return breakers.get(model)!;
}

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }
    client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://nexuszero.com',
        'X-Title': process.env.OPENROUTER_SITE_NAME ?? 'NexusZero',
      },
    });
  }
  return client;
}

function buildMessages(req: CompletionRequest): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const msgs: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  if (req.systemPrompt) msgs.push({ role: 'system', content: req.systemPrompt });

  for (const msg of req.messages) {
    if (msg.role === 'user') {
      // Scan user messages for prompt injection
      const scan = scanForInjection(msg.content);
      if (scan.risk === 'high') {
        console.warn(`[llm-router] High-risk prompt injection detected: ${scan.triggers.join(', ')}`);
        msgs.push({ role: msg.role, content: sanitizePromptInput(msg.content) });
      } else {
        msgs.push(msg);
      }
    } else {
      msgs.push(msg);
    }
  }

  return msgs;
}

/** Execute a chat completion via OpenRouter with circuit-breaker protection */
export async function routedCompletion(req: CompletionRequest): Promise<string> {
  const result = await routedCompletionWithUsage(req);
  return result.content;
}

/** Execute a chat completion and return full result with token usage */
export async function routedCompletionWithUsage(req: CompletionRequest): Promise<CompletionResult> {
  const messages = buildMessages(req);
  const startTime = Date.now();

  const attempt = async (model: string) =>
    getBreaker(model).execute(async () => {
      const response = await getClient().chat.completions.create({
        model,
        messages,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.7,
      });
      return {
        content: response.choices[0]?.message?.content ?? '',
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      };
    });

  let usedModel = req.model;
  try {
    const result = await attempt(req.model);
    const durationMs = Date.now() - startTime;
    trackCompletion({
      model: usedModel,
      agentType: req.agentType,
      taskId: req.taskId,
      inputMessages: messages,
      outputContent: result.content,
      durationMs,
    }).catch(() => {}); // Fire-and-forget
    return {
      content: result.content,
      inputTokens: result.promptTokens,
      outputTokens: result.completionTokens,
      model: usedModel,
      durationMs,
    };
  } catch (err) {
    if (req.model !== OPENROUTER_MODELS.HAIKU) {
      console.warn(`[llm-router] Primary model ${req.model} failed, falling back to haiku:`, err);
      usedModel = OPENROUTER_MODELS.HAIKU;
      const result = await attempt(OPENROUTER_MODELS.HAIKU);
      const durationMs = Date.now() - startTime;
      trackCompletion({
        model: usedModel,
        agentType: req.agentType,
        taskId: req.taskId,
        inputMessages: messages,
        outputContent: result.content,
        durationMs,
      }).catch(() => {});
      return {
        content: result.content,
        inputTokens: result.promptTokens,
        outputTokens: result.completionTokens,
        model: usedModel,
        durationMs,
      };
    }
    throw err;
  }
}

/** Stream a chat completion via OpenRouter */
export async function* routedStream(req: CompletionRequest): AsyncGenerator<string> {
  const messages = buildMessages(req);

  const stream = await getClient().chat.completions.create({
    model: req.model,
    messages,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.7,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
