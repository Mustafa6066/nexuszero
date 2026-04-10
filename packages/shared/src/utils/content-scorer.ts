/**
 * Content Quality Scorer
 *
 * 5-dimension weighted scoring system for evaluating content quality.
 * Voice similarity (35%), Specificity (25%), AI slop penalty (20%),
 * Length appropriateness (10%), Engagement potential (10%).
 *
 * Ported from: ai-marketing-skills content-ops/scripts/content-quality-scorer.py
 */

import { routedCompletion } from '@nexuszero/llm-router';
import { scanForSlop } from './humanizer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentScoreResult {
  /** Total weighted score 0-100 */
  totalScore: number;
  /** Individual dimension scores */
  dimensions: {
    voiceSimilarity: DimensionScore;
    specificity: DimensionScore;
    aiSlopPenalty: DimensionScore;
    lengthAppropriateness: DimensionScore;
    engagementPotential: DimensionScore;
  };
  /** Pass/fail at threshold */
  passed: boolean;
  threshold: number;
  /** Human-readable summary */
  summary: string;
}

export interface DimensionScore {
  /** Raw score 0-100 */
  raw: number;
  /** Weight applied (0-1) */
  weight: number;
  /** Weighted contribution to total */
  weighted: number;
  /** Brief explanation */
  rationale: string;
}

export interface ContentScoreConfig {
  /** Target voice/tone to match (e.g., brand description, sample text) */
  voiceReference?: string;
  /** Expected content type for length calibration */
  contentType?: 'blog_post' | 'email' | 'ad_copy' | 'social_post' | 'landing_page' | 'newsletter';
  /** Target word count range [min, max] */
  targetWordCount?: [number, number];
  /** Minimum total score to pass (default 70) */
  threshold?: number;
  /** LLM model for voice/engagement scoring */
  model?: string;
  /** Custom dimension weights (must sum to 1.0) */
  weights?: {
    voiceSimilarity?: number;
    specificity?: number;
    aiSlopPenalty?: number;
    lengthAppropriateness?: number;
    engagementPotential?: number;
  };
}

// ---------------------------------------------------------------------------
// Default weights
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHTS = {
  voiceSimilarity: 0.35,
  specificity: 0.25,
  aiSlopPenalty: 0.20,
  lengthAppropriateness: 0.10,
  engagementPotential: 0.10,
} as const;

// Default word count ranges by content type
const WORD_COUNT_RANGES: Record<string, [number, number]> = {
  blog_post: [800, 2500],
  email: [100, 500],
  ad_copy: [15, 150],
  social_post: [20, 280],
  landing_page: [300, 1500],
  newsletter: [400, 1200],
};

// ---------------------------------------------------------------------------
// Dimension scorers
// ---------------------------------------------------------------------------

/**
 * Score AI slop penalty (deterministic — uses humanizer).
 */
function scoreAiSlop(content: string): DimensionScore {
  const result = scanForSlop(content, 90);
  return {
    raw: result.score,
    weight: DEFAULT_WEIGHTS.aiSlopPenalty,
    weighted: result.score * DEFAULT_WEIGHTS.aiSlopPenalty,
    rationale: result.violations.length === 0
      ? 'No AI patterns detected'
      : `${result.violations.length} AI pattern(s) found: ${result.violations.slice(0, 3).map(v => v.label).join(', ')}`,
  };
}

/**
 * Score length appropriateness.
 */
function scoreLengthAppropriateness(
  content: string,
  targetRange: [number, number],
): DimensionScore {
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  const [min, max] = targetRange;

  let raw: number;
  let rationale: string;

  if (wordCount >= min && wordCount <= max) {
    raw = 100;
    rationale = `${wordCount} words — within target range (${min}-${max})`;
  } else if (wordCount < min) {
    const deficit = (min - wordCount) / min;
    raw = Math.max(0, 100 - deficit * 100);
    rationale = `${wordCount} words — ${min - wordCount} below minimum (${min})`;
  } else {
    const excess = (wordCount - max) / max;
    raw = Math.max(0, 100 - excess * 80); // Over-length penalized less than under
    rationale = `${wordCount} words — ${wordCount - max} above maximum (${max})`;
  }

  return {
    raw,
    weight: DEFAULT_WEIGHTS.lengthAppropriateness,
    weighted: raw * DEFAULT_WEIGHTS.lengthAppropriateness,
    rationale,
  };
}

/**
 * Score specificity (ratio of concrete details vs vague claims).
 */
function scoreSpecificity(content: string): DimensionScore {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length === 0) {
    return { raw: 0, weight: DEFAULT_WEIGHTS.specificity, weighted: 0, rationale: 'No sentences found' };
  }

  // Heuristics for specificity
  const numberPattern = /\b\d+[\d,.%$€£]*\b/g;
  const properNounPattern = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;
  const quotePattern = /[""][^""]+[""]/g;
  const vaguePattern = /\b(many|several|numerous|various|some|certain|significant|substantial|considerable|important|key|major|critical)\b/gi;

  const numbers = (content.match(numberPattern) || []).length;
  const properNouns = (content.match(properNounPattern) || []).length;
  const quotes = (content.match(quotePattern) || []).length;
  const vagueWords = (content.match(vaguePattern) || []).length;

  // Specificity score: more numbers/names/quotes = more specific, more vague words = less
  const specificSignals = numbers + properNouns * 0.5 + quotes * 2;
  const vagueSignals = vagueWords;

  const ratio = sentences.length > 0
    ? (specificSignals - vagueSignals * 0.5) / sentences.length
    : 0;

  // Normalize to 0-100 (0.5 ratio = 100)
  const raw = Math.max(0, Math.min(100, ratio * 200));

  return {
    raw,
    weight: DEFAULT_WEIGHTS.specificity,
    weighted: raw * DEFAULT_WEIGHTS.specificity,
    rationale: `${numbers} numbers, ${properNouns} proper nouns, ${quotes} quotes, ${vagueWords} vague words across ${sentences.length} sentences`,
  };
}

/**
 * Score voice similarity and engagement potential via LLM.
 * Combined into a single LLM call for efficiency.
 */
async function scoreLlmDimensions(
  content: string,
  voiceReference: string,
  model: string,
): Promise<{ voiceSimilarity: DimensionScore; engagementPotential: DimensionScore }> {
  const prompt = `Evaluate this content on two dimensions. Score each 0-100.

${voiceReference ? `TARGET VOICE/TONE: ${voiceReference}\n` : ''}
CONTENT:
---
${content.slice(0, 3000)}
---

Rate:
1. Voice Similarity — How well does the content match the target voice? (warmth, formality, persona, vocabulary). If no target voice provided, score based on consistency and authenticity.
2. Engagement Potential — How likely is this content to get clicks, shares, comments, or conversions? (hook strength, emotional resonance, novelty, actionability).

Respond with ONLY valid JSON:
{"voiceScore": <number>, "voiceRationale": "<1 sentence>", "engagementScore": <number>, "engagementRationale": "<1 sentence>"}`;

  try {
    const result = await routedCompletion({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
      temperature: 0.2,
    });

    const parsed = JSON.parse(result.content.replace(/```json?\n?/g, '').replace(/```/g, ''));
    const voiceRaw = Math.max(0, Math.min(100, Number(parsed.voiceScore) || 50));
    const engagementRaw = Math.max(0, Math.min(100, Number(parsed.engagementScore) || 50));

    return {
      voiceSimilarity: {
        raw: voiceRaw,
        weight: DEFAULT_WEIGHTS.voiceSimilarity,
        weighted: voiceRaw * DEFAULT_WEIGHTS.voiceSimilarity,
        rationale: String(parsed.voiceRationale || 'LLM voice assessment'),
      },
      engagementPotential: {
        raw: engagementRaw,
        weight: DEFAULT_WEIGHTS.engagementPotential,
        weighted: engagementRaw * DEFAULT_WEIGHTS.engagementPotential,
        rationale: String(parsed.engagementRationale || 'LLM engagement assessment'),
      },
    };
  } catch {
    return {
      voiceSimilarity: {
        raw: 50,
        weight: DEFAULT_WEIGHTS.voiceSimilarity,
        weighted: 50 * DEFAULT_WEIGHTS.voiceSimilarity,
        rationale: 'Unable to assess voice — defaulting to 50',
      },
      engagementPotential: {
        raw: 50,
        weight: DEFAULT_WEIGHTS.engagementPotential,
        weighted: 50 * DEFAULT_WEIGHTS.engagementPotential,
        rationale: 'Unable to assess engagement — defaulting to 50',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Score content across 5 quality dimensions.
 *
 * @param content - Text content to score
 * @param config - Scoring configuration
 * @returns ContentScoreResult with dimensional breakdown
 */
export async function scoreContent(
  content: string,
  config: ContentScoreConfig = {},
): Promise<ContentScoreResult> {
  const {
    voiceReference = '',
    contentType = 'blog_post',
    targetWordCount = WORD_COUNT_RANGES[contentType] ?? [500, 2000],
    threshold = 70,
    model = 'anthropic/claude-sonnet-4-5',
  } = config;

  // Run deterministic scorers
  const aiSlop = scoreAiSlop(content);
  const length = scoreLengthAppropriateness(content, targetWordCount);
  const specificity = scoreSpecificity(content);

  // Run LLM scorers (combined into single call)
  const llmScores = await scoreLlmDimensions(content, voiceReference, model);

  const dimensions = {
    voiceSimilarity: llmScores.voiceSimilarity,
    specificity,
    aiSlopPenalty: aiSlop,
    lengthAppropriateness: length,
    engagementPotential: llmScores.engagementPotential,
  };

  const totalScore = Object.values(dimensions).reduce((sum, d) => sum + d.weighted, 0);
  const passed = totalScore >= threshold;

  const summary = passed
    ? `Content scored ${totalScore.toFixed(1)}/100 — passes threshold (${threshold}).`
    : `Content scored ${totalScore.toFixed(1)}/100 — below threshold (${threshold}). Weakest: ${Object.entries(dimensions)
        .sort(([, a], [, b]) => a.raw - b.raw)
        .slice(0, 2)
        .map(([k, v]) => `${k} (${v.raw.toFixed(0)})`)
        .join(', ')}.`;

  return { totalScore, dimensions, passed, threshold, summary };
}
