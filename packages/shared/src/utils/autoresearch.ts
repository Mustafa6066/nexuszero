/**
 * Autoresearch Engine
 *
 * Karpathy-inspired iterative optimization: generate N variants → score with
 * expert panel → evolve top performers → cross-breed winners → repeat until
 * target score. Configurable for landing pages, emails, ad copy, forms.
 *
 * Ported from: ai-marketing-skills autoresearch/autoresearch.py
 */

import { routedCompletion } from '@nexuszero/llm-router';
import { runExpertPanel, type ExpertPanelConfig, type ExpertPanelResult } from './expert-panel.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoresearchConfig {
  /** What to optimize (determines expert panel + generation prompts) */
  contentType: ExpertPanelConfig['contentType'];
  /** Brief / specification describing what to create */
  brief: string;
  /** Number of initial variants to generate (default 5) */
  initialVariants?: number;
  /** Number of top variants to keep per generation (default 3) */
  topK?: number;
  /** Maximum generations before stopping (default 4) */
  maxGenerations?: number;
  /** Target score to stop early (default 90) */
  targetScore?: number;
  /** LLM model for generation */
  model?: string;
  /** Voice/tone reference for scoring */
  voiceReference?: string;
  /** Additional context (brand guidelines, audience info, etc.) */
  context?: string;
}

export interface AutoresearchVariant {
  id: string;
  generation: number;
  content: string;
  score: number;
  panelResult: ExpertPanelResult;
  parentIds: string[];
}

export interface AutoresearchResult {
  /** Best variant found */
  winner: AutoresearchVariant;
  /** All variants sorted by score */
  allVariants: AutoresearchVariant[];
  /** Number of generations run */
  totalGenerations: number;
  /** Whether target score was reached */
  targetReached: boolean;
  /** Summary of the optimization run */
  summary: string;
}

// ---------------------------------------------------------------------------
// Variant generation
// ---------------------------------------------------------------------------

let variantCounter = 0;

function generateVariantId(generation: number): string {
  return `gen${generation}_v${++variantCounter}`;
}

/**
 * Generate initial variants from the brief.
 */
async function generateInitialVariants(
  brief: string,
  contentType: string,
  count: number,
  model: string,
  context?: string,
): Promise<string[]> {
  const variants: string[] = [];

  for (let i = 0; i < count; i++) {
    const anglePrompts = [
      'Take a contrarian, data-driven approach.',
      'Lead with a surprising story or anecdote.',
      'Use a framework/methodology-first structure.',
      'Open with a provocative question challenging conventional wisdom.',
      'Take a practical, step-by-step tutorial approach.',
    ];

    const angle = anglePrompts[i % anglePrompts.length];

    const prompt = `Create a ${contentType.replace(/_/g, ' ')} based on this brief:

BRIEF: ${brief}
${context ? `\nCONTEXT: ${context}` : ''}

CREATIVE ANGLE: ${angle}

Write the FULL content — no placeholders, no instructions, no meta-commentary. Just the final ${contentType.replace(/_/g, ' ')} ready for publication.`;

    const result = await routedCompletion({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      temperature: 0.8 + (i * 0.05), // Slightly increase randomness per variant
    });

    variants.push(result.content.trim());
  }

  return variants;
}

/**
 * Cross-breed two high-scoring variants into a new variant.
 */
async function crossBreed(
  variantA: AutoresearchVariant,
  variantB: AutoresearchVariant,
  contentType: string,
  model: string,
): Promise<string> {
  const feedbackA = variantA.panelResult.rounds[0]?.scores
    .filter(s => s.score >= 80)
    .map(s => `${s.expertName}: ${s.feedback}`)
    .join('\n') ?? '';

  const feedbackB = variantB.panelResult.rounds[0]?.scores
    .filter(s => s.score >= 80)
    .map(s => `${s.expertName}: ${s.feedback}`)
    .join('\n') ?? '';

  const prompt = `Combine the best elements of these two ${contentType.replace(/_/g, ' ')} variants into a superior version.

VARIANT A (scored ${variantA.score.toFixed(0)}/100):
---
${variantA.content.slice(0, 2000)}
---

STRENGTHS OF A:
${feedbackA || 'General quality'}

VARIANT B (scored ${variantB.score.toFixed(0)}/100):
---
${variantB.content.slice(0, 2000)}
---

STRENGTHS OF B:
${feedbackB || 'General quality'}

Create a new version that takes the strongest elements from both. Write the FULL content — no placeholders.`;

  const result = await routedCompletion({
    model,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4096,
    temperature: 0.7,
  });

  return result.content.trim();
}

/**
 * Evolve a variant by applying its expert panel feedback.
 */
async function evolveVariant(
  variant: AutoresearchVariant,
  contentType: string,
  model: string,
): Promise<string> {
  const lowScorers = variant.panelResult.rounds[0]?.scores
    .filter(s => s.score < 85)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4) ?? [];

  const feedback = lowScorers
    .map(s => `[${s.expertName} — ${s.score}/100]: ${s.feedback}`)
    .join('\n');

  if (!feedback) return variant.content; // No weak areas to improve

  const prompt = `Improve this ${contentType.replace(/_/g, ' ')} based on expert feedback. Fix ALL identified issues while preserving what works well.

EXPERT FEEDBACK:
${feedback}

CURRENT CONTENT:
---
${variant.content}
---

Write the IMPROVED full content — no placeholders, no meta-commentary.`;

  const result = await routedCompletion({
    model,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4096,
    temperature: 0.6,
  });

  return result.content.trim();
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Run the Autoresearch optimization engine.
 *
 * Generates N variants → scores with expert panel → evolves top K →
 * cross-breeds winners → repeats until target score or max generations.
 *
 * @param config - Optimization configuration
 * @returns AutoresearchResult with winning variant and full history
 */
export async function runAutoresearch(config: AutoresearchConfig): Promise<AutoresearchResult> {
  const {
    contentType,
    brief,
    initialVariants: variantCount = 5,
    topK = 3,
    maxGenerations = 4,
    targetScore = 90,
    model = 'anthropic/claude-sonnet-4-5',
    voiceReference,
    context,
  } = config;

  variantCounter = 0;
  const allVariants: AutoresearchVariant[] = [];
  let currentVariants: AutoresearchVariant[] = [];

  // --- Generation 1: Create initial variants ---
  const initialContents = await generateInitialVariants(brief, contentType, variantCount, model, context);

  // Score all initial variants
  for (const content of initialContents) {
    const panelResult = await runExpertPanel(content, {
      contentType,
      maxRounds: 1, // Single round for initial screening
      model,
      humanizerWeight: 1.5,
    });

    const variant: AutoresearchVariant = {
      id: generateVariantId(1),
      generation: 1,
      content,
      score: panelResult.finalScore,
      panelResult,
      parentIds: [],
    };

    currentVariants.push(variant);
    allVariants.push(variant);
  }

  // Check if any initial variant already meets the target
  currentVariants.sort((a, b) => b.score - a.score);
  if (currentVariants[0] && currentVariants[0].score >= targetScore) {
    return buildResult(currentVariants[0], allVariants, 1, true);
  }

  // --- Generations 2+: Evolve and cross-breed ---
  for (let gen = 2; gen <= maxGenerations; gen++) {
    // Keep top K from current generation
    const topVariants = currentVariants.slice(0, topK);
    const nextGenContents: Array<{ content: string; parentIds: string[] }> = [];

    // Evolve each top variant
    for (const v of topVariants) {
      const evolved = await evolveVariant(v, contentType, model);
      nextGenContents.push({ content: evolved, parentIds: [v.id] });
    }

    // Cross-breed top 2 (if we have at least 2)
    if (topVariants.length >= 2) {
      const crossbred = await crossBreed(topVariants[0]!, topVariants[1]!, contentType, model);
      nextGenContents.push({ content: crossbred, parentIds: [topVariants[0]!.id, topVariants[1]!.id] });
    }

    // Score all new variants
    currentVariants = [];
    for (const entry of nextGenContents) {
      const panelResult = await runExpertPanel(entry.content, {
        contentType,
        maxRounds: 1,
        model,
        humanizerWeight: 1.5,
      });

      const variant: AutoresearchVariant = {
        id: generateVariantId(gen),
        generation: gen,
        content: entry.content,
        score: panelResult.finalScore,
        panelResult,
        parentIds: entry.parentIds,
      };

      currentVariants.push(variant);
      allVariants.push(variant);
    }

    currentVariants.sort((a, b) => b.score - a.score);

    // Early exit if target reached
    if (currentVariants[0] && currentVariants[0].score >= targetScore) {
      return buildResult(currentVariants[0], allVariants, gen, true);
    }
  }

  // Return best overall
  allVariants.sort((a, b) => b.score - a.score);
  return buildResult(allVariants[0]!, allVariants, maxGenerations, false);
}

function buildResult(
  winner: AutoresearchVariant,
  allVariants: AutoresearchVariant[],
  totalGenerations: number,
  targetReached: boolean,
): AutoresearchResult {
  const sorted = [...allVariants].sort((a, b) => b.score - a.score);
  return {
    winner,
    allVariants: sorted,
    totalGenerations,
    targetReached,
    summary: targetReached
      ? `Target reached in generation ${totalGenerations}. Winner scored ${winner.score.toFixed(1)}/100 across ${allVariants.length} variants.`
      : `Completed ${totalGenerations} generations (${allVariants.length} variants). Best score: ${winner.score.toFixed(1)}/100.`,
  };
}
