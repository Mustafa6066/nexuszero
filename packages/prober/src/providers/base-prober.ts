/**
 * Base prober interface — each LLM provider implements this contract.
 *
 * A prober sends a real user-style query to an LLM API and returns
 * the raw response text + any citation URLs the provider surface provides.
 */

export interface ProbeResult {
  /** Full text response from the LLM */
  responseText: string;
  /** Source URLs explicitly returned by the provider (e.g. Perplexity citations) */
  citations: string[];
  /** Model identifier that produced this response */
  model: string;
  /** Round-trip latency in milliseconds */
  latencyMs: number;
  /** Approximate token usage (if available from the API) */
  tokensUsed: number;
  /** Provider identifier */
  provider: string;
}

export interface ProbeOptions {
  /** System prompt override (default is a generic information-seeking persona) */
  systemPrompt?: string;
  /** Max tokens for the response */
  maxTokens?: number;
  /** Temperature (lower = more deterministic) */
  temperature?: number;
}

export interface ProberProvider {
  /** Unique identifier for this provider (e.g. 'openai', 'perplexity', 'gemini') */
  readonly name: string;
  /** Send a query and get back the raw response */
  probe(query: string, opts?: ProbeOptions): Promise<ProbeResult>;
  /** Check if this provider is configured (API key present) */
  isConfigured(): boolean;
}
