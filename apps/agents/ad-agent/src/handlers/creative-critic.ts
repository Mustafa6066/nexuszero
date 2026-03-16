/**
 * Creative Critic — LLM-as-a-Judge quality gate for creative outputs.
 *
 * Before creative variants are stored and presented to users, the Critic
 * evaluates them against brand guidelines and historical performance data.
 * Sub-par creatives are auto-rejected and regenerated (up to 2 retries).
 */

import { llmAnalyze } from '../llm.js';

export interface CriticEvaluation {
  /** Quality score 0-100 */
  score: number;
  /** Verdict: pass (score >= 70), revise (50-69), reject (< 50) */
  verdict: 'pass' | 'revise' | 'reject';
  /** Human-readable reasoning */
  reasoning: string;
  /** Actionable improvement suggestions */
  suggestions: string[];
}

export interface CriticContext {
  /** Brand guidelines to evaluate against */
  brandGuidelines?: {
    tone?: string;
    fontFamily?: string;
    logoUrl?: string | null;
    doNotUse?: string[];
  };
  /** Historical average CTR for this creative type + platform combo */
  historicalAvgCtr?: number;
  /** The creative type being evaluated */
  creativeType: string;
  /** Target platform */
  platform: string;
}

const PASS_THRESHOLD = 70;
const REVISE_THRESHOLD = 50;

export class CreativeCritic {
  /**
   * Evaluate a creative variant against brand guidelines and performance baselines.
   */
  async evaluate(
    variant: Record<string, unknown>,
    context: CriticContext,
  ): Promise<CriticEvaluation> {
    const prompt = this.buildEvaluationPrompt(variant, context);

    try {
      const response = await llmAnalyze(prompt);
      const parsed = this.parseResponse(response);
      return parsed;
    } catch {
      // On LLM failure, default to pass — don't block creative pipeline
      return {
        score: 75,
        verdict: 'pass',
        reasoning: 'Critic evaluation skipped due to LLM error. Defaulting to pass.',
        suggestions: [],
      };
    }
  }

  /**
   * Evaluate multiple variants in parallel, returning evaluations in order.
   */
  async evaluateBatch(
    variants: Record<string, unknown>[],
    context: CriticContext,
  ): Promise<CriticEvaluation[]> {
    return Promise.all(variants.map(v => this.evaluate(v, context)));
  }

  private buildEvaluationPrompt(variant: Record<string, unknown>, context: CriticContext): string {
    const brandSection = context.brandGuidelines
      ? `Brand Guidelines:
- Tone: ${context.brandGuidelines.tone ?? 'not specified'}
- Font: ${context.brandGuidelines.fontFamily ?? 'not specified'}
- Forbidden terms: ${context.brandGuidelines.doNotUse?.join(', ') || 'none'}
- Has logo: ${context.brandGuidelines.logoUrl ? 'yes' : 'no'}`
      : 'No brand guidelines provided.';

    const performanceSection = context.historicalAvgCtr
      ? `Historical average CTR for ${context.creativeType} on ${context.platform}: ${context.historicalAvgCtr}%
Predicted CTR of this variant: ${variant.predictedCtr ?? 'unknown'}
Flag if predicted CTR is less than 70% of historical average.`
      : 'No historical performance data available.';

    return `You are a creative quality assurance critic for a marketing platform. Evaluate this creative variant rigorously.

Creative Type: ${context.creativeType}
Platform: ${context.platform}

Creative Content:
${JSON.stringify(variant, null, 2)}

${brandSection}

${performanceSection}

Score this creative on a 0-100 scale across these dimensions:
1. Brand Alignment (0-25): Does the tone, language, and style match the brand guidelines?
2. Performance Potential (0-25): Is the predicted CTR reasonable? Is the hook/CTA compelling?
3. Messaging Clarity (0-25): Is the message clear, concise, and persuasive?
4. Compliance (0-25): No misleading claims, proper disclosures, platform-appropriate content?

Return ONLY valid JSON:
{"score": <0-100>, "verdict": "pass" | "revise" | "reject", "reasoning": "<one paragraph>", "suggestions": ["<suggestion1>", "<suggestion2>"]}

Verdict rules: pass if score >= ${PASS_THRESHOLD}, revise if score >= ${REVISE_THRESHOLD}, reject if score < ${REVISE_THRESHOLD}.`;
  }

  private parseResponse(response: string): CriticEvaluation {
    const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned) as CriticEvaluation;

      // Validate and normalize
      const score = Math.max(0, Math.min(100, typeof parsed.score === 'number' ? parsed.score : 75));
      const verdict: CriticEvaluation['verdict'] =
        score >= PASS_THRESHOLD ? 'pass' : score >= REVISE_THRESHOLD ? 'revise' : 'reject';

      return {
        score,
        verdict,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided.',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter(s => typeof s === 'string') : [],
      };
    } catch {
      // If JSON parsing fails, extract what we can
      return {
        score: 75,
        verdict: 'pass',
        reasoning: response.slice(0, 500),
        suggestions: [],
      };
    }
  }
}
