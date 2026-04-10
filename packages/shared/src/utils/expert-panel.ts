/**
 * Expert Panel Scoring Engine
 *
 * Auto-assembles 7-10 expert personas per content type, runs recursive
 * LLM scoring loops (max 3 rounds) targeting 90+/100, with the humanizer
 * weighted at 1.5x. Supports variant comparison mode.
 *
 * Ported from: ai-marketing-skills content-ops/SKILL.md expert panel workflow
 */

import { routedCompletion, type CompletionRequest } from '@nexuszero/llm-router';
import { scanForSlop, generateRewriteInstructions, type HumanizerResult } from './humanizer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpertPersona {
  id: string;
  name: string;
  role: string;
  /** What this expert evaluates */
  focus: string;
  /** Scoring weight (1.0 = normal, 1.5 = elevated) */
  weight: number;
}

export interface ExpertScore {
  expertId: string;
  expertName: string;
  score: number;
  feedback: string;
  weight: number;
  weightedScore: number;
}

export interface PanelRoundResult {
  round: number;
  scores: ExpertScore[];
  weightedAverage: number;
  humanizerResult: HumanizerResult;
  /** Combined weighted score including humanizer */
  finalScore: number;
  passed: boolean;
  rewriteInstructions: string | null;
}

export interface ExpertPanelResult {
  /** Final weighted score after all rounds */
  finalScore: number;
  passed: boolean;
  totalRounds: number;
  rounds: PanelRoundResult[];
  /** The content version that scored highest */
  bestContent: string;
  /** Expert panel feedback summary */
  summary: string;
}

export interface ExpertPanelConfig {
  /** Content type to evaluate (determines expert assembly) */
  contentType: 'blog_post' | 'email' | 'ad_copy' | 'landing_page' | 'social_post' | 'x_longform' | 'newsletter' | 'video_script';
  /** Target score to pass (default 90) */
  targetScore?: number;
  /** Maximum scoring rounds (default 3) */
  maxRounds?: number;
  /** LLM model to use for scoring */
  model?: string;
  /** Humanizer weight multiplier (default 1.5) */
  humanizerWeight?: number;
  /** Tenant ID for LLM cost attribution */
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// Expert persona assembly
// ---------------------------------------------------------------------------

const EXPERT_POOL: Record<string, ExpertPersona[]> = {
  blog_post: [
    { id: 'seo_strategist', name: 'SEO Strategist', role: 'SEO Expert', focus: 'Keyword integration, search intent match, meta optimization', weight: 1.0 },
    { id: 'content_strategist', name: 'Content Strategist', role: 'Strategy Lead', focus: 'Structure, flow, audience alignment, CTA placement', weight: 1.0 },
    { id: 'humanizer', name: 'Humanizer', role: 'AI Detection Specialist', focus: 'Natural language, voice consistency, slop detection', weight: 1.5 },
    { id: 'editor', name: 'Senior Editor', role: 'Editorial', focus: 'Grammar, clarity, conciseness, readability', weight: 1.0 },
    { id: 'engagement_expert', name: 'Engagement Expert', role: 'Audience Engagement', focus: 'Hook strength, scroll retention, shareability', weight: 1.0 },
    { id: 'brand_voice', name: 'Brand Voice Guardian', role: 'Brand', focus: 'Tone consistency, brand alignment, personality match', weight: 1.0 },
    { id: 'data_storyteller', name: 'Data Storyteller', role: 'Analytics', focus: 'Evidence quality, data presentation, credibility', weight: 1.0 },
  ],
  email: [
    { id: 'email_specialist', name: 'Email Marketing Specialist', role: 'Email Expert', focus: 'Subject line, preview text, deliverability signals', weight: 1.2 },
    { id: 'copywriter', name: 'D/R Copywriter', role: 'Copy', focus: 'Persuasion, urgency, CTA clarity', weight: 1.0 },
    { id: 'humanizer', name: 'Humanizer', role: 'AI Detection Specialist', focus: 'Natural language, spam trigger avoidance', weight: 1.5 },
    { id: 'ux_writer', name: 'UX Writer', role: 'UX', focus: 'Scannability, mobile readability, hierarchy', weight: 1.0 },
    { id: 'brand_voice', name: 'Brand Voice Guardian', role: 'Brand', focus: 'Tone consistency, warmth, personality', weight: 1.0 },
    { id: 'conversion_expert', name: 'Conversion Expert', role: 'CRO', focus: 'Click-through optimization, friction reduction', weight: 1.0 },
    { id: 'compliance', name: 'Compliance Reviewer', role: 'Legal', focus: 'CAN-SPAM compliance, unsubscribe, disclaimers', weight: 0.8 },
  ],
  ad_copy: [
    { id: 'performance_marketer', name: 'Performance Marketer', role: 'Paid Media', focus: 'CTR optimization, platform compliance, character limits', weight: 1.2 },
    { id: 'copywriter', name: 'D/R Copywriter', role: 'Copy', focus: 'Headline punch, benefit framing, urgency', weight: 1.0 },
    { id: 'humanizer', name: 'Humanizer', role: 'AI Detection Specialist', focus: 'Natural language, authenticity', weight: 1.5 },
    { id: 'psychologist', name: 'Consumer Psychologist', role: 'Psychology', focus: 'Emotional triggers, cognitive biases, motivation', weight: 1.0 },
    { id: 'brand_voice', name: 'Brand Voice Guardian', role: 'Brand', focus: 'Tone, brand safety, consistency', weight: 1.0 },
    { id: 'competitor_analyst', name: 'Competitive Analyst', role: 'Strategy', focus: 'Differentiation, positioning, unique value props', weight: 0.8 },
    { id: 'compliance', name: 'Ad Compliance Reviewer', role: 'Legal', focus: 'Platform policies, claims substantiation', weight: 0.8 },
  ],
  landing_page: [
    { id: 'cro_expert', name: 'CRO Expert', role: 'Conversion', focus: 'Above-the-fold, form friction, trust signals', weight: 1.2 },
    { id: 'copywriter', name: 'Landing Page Copywriter', role: 'Copy', focus: 'Headline hierarchy, benefit stacking, social proof', weight: 1.0 },
    { id: 'humanizer', name: 'Humanizer', role: 'AI Detection Specialist', focus: 'Natural voice, specificity over vagueness', weight: 1.5 },
    { id: 'ux_designer', name: 'UX Designer', role: 'UX', focus: 'Visual hierarchy, CTA placement, cognitive load', weight: 1.0 },
    { id: 'seo_strategist', name: 'SEO Strategist', role: 'SEO', focus: 'On-page optimization, schema markup, page speed', weight: 0.8 },
    { id: 'social_proof', name: 'Social Proof Specialist', role: 'Trust', focus: 'Testimonials, logos, case study placement', weight: 0.8 },
    { id: 'mobile_expert', name: 'Mobile UX Expert', role: 'Mobile', focus: 'Responsive copy, thumb-zone CTA, load time', weight: 0.8 },
  ],
  social_post: [
    { id: 'social_strategist', name: 'Social Media Strategist', role: 'Social', focus: 'Platform-native format, algorithm signals, hashtags', weight: 1.2 },
    { id: 'humanizer', name: 'Humanizer', role: 'AI Detection Specialist', focus: 'Conversational tone, authentic voice', weight: 1.5 },
    { id: 'engagement_expert', name: 'Engagement Expert', role: 'Engagement', focus: 'Hook, shareability, comment triggers', weight: 1.0 },
    { id: 'brand_voice', name: 'Brand Voice Guardian', role: 'Brand', focus: 'Personality, warmth, consistency', weight: 1.0 },
    { id: 'viral_analyst', name: 'Viral Content Analyst', role: 'Growth', focus: 'Emotional resonance, controversy balance, novelty', weight: 1.0 },
    { id: 'visual_strategist', name: 'Visual Strategist', role: 'Creative', focus: 'Image/video pairing, visual hooks, format', weight: 0.8 },
    { id: 'community_manager', name: 'Community Manager', role: 'Community', focus: 'Reply-worthiness, conversation starters', weight: 0.8 },
  ],
  x_longform: [
    { id: 'x_specialist', name: 'X/Twitter Specialist', role: 'Platform Expert', focus: 'Long-form article format, reading time, thread vs article', weight: 1.2 },
    { id: 'humanizer', name: 'Humanizer', role: 'AI Detection Specialist', focus: 'Conversational tone, contrarian framing, specificity', weight: 1.5 },
    { id: 'contrarian_thinker', name: 'Contrarian Thinker', role: 'Thought Leadership', focus: 'Unique angles, counterintuitive insights, original frameworks', weight: 1.2 },
    { id: 'data_storyteller', name: 'Data Storyteller', role: 'Evidence', focus: 'Concrete numbers, ASCII diagram clarity, proof points', weight: 1.0 },
    { id: 'engagement_expert', name: 'Engagement Expert', role: 'Engagement', focus: 'Hook strength, bookmark-worthy sections, share triggers', weight: 1.0 },
    { id: 'editor', name: 'Senior Editor', role: 'Editorial', focus: 'Flow, section transitions, conclusion punch', weight: 1.0 },
    { id: 'brand_voice', name: 'Brand Voice Guardian', role: 'Brand', focus: 'Authentic practitioner tone, no corporate speak', weight: 0.8 },
  ],
  newsletter: [
    { id: 'newsletter_expert', name: 'Newsletter Expert', role: 'Email Publishing', focus: 'Subject line, open rate signals, format', weight: 1.2 },
    { id: 'humanizer', name: 'Humanizer', role: 'AI Detection Specialist', focus: 'Personal tone, conversational voice', weight: 1.5 },
    { id: 'curator', name: 'Content Curator', role: 'Curation', focus: 'Link quality, insight density, novelty', weight: 1.0 },
    { id: 'editor', name: 'Senior Editor', role: 'Editorial', focus: 'Scannability, section balance, readability', weight: 1.0 },
    { id: 'brand_voice', name: 'Brand Voice Guardian', role: 'Brand', focus: 'Personality, inside-joke accessibility', weight: 1.0 },
    { id: 'growth_expert', name: 'Growth Expert', role: 'Growth', focus: 'Forward-to-a-friend triggers, referral hooks', weight: 0.8 },
    { id: 'engagement_expert', name: 'Engagement Expert', role: 'Engagement', focus: 'Reply triggers, poll opportunities', weight: 0.8 },
  ],
  video_script: [
    { id: 'video_producer', name: 'Video Producer', role: 'Production', focus: 'Pacing, visual cues, B-roll notes', weight: 1.2 },
    { id: 'humanizer', name: 'Humanizer', role: 'AI Detection Specialist', focus: 'Spoken cadence, natural dialogue, personality', weight: 1.5 },
    { id: 'storyteller', name: 'Storyteller', role: 'Narrative', focus: 'Hook → Build → Payoff arc, tension, resolution', weight: 1.2 },
    { id: 'engagement_expert', name: 'Engagement Expert', role: 'Retention', focus: 'Opening hook, mid-roll retention, end screen CTA', weight: 1.0 },
    { id: 'editor', name: 'Senior Editor', role: 'Editorial', focus: 'Script clarity, reading time estimation', weight: 1.0 },
    { id: 'seo_strategist', name: 'SEO Strategist', role: 'YouTube SEO', focus: 'Title, description, tags, chapters', weight: 0.8 },
    { id: 'brand_voice', name: 'Brand Voice Guardian', role: 'Brand', focus: 'On-camera persona consistency', weight: 0.8 },
  ],
};

/**
 * Assemble expert panel for a content type.
 */
export function assemblePanel(contentType: ExpertPanelConfig['contentType']): ExpertPersona[] {
  return EXPERT_POOL[contentType] ?? EXPERT_POOL.blog_post!;
}

// ---------------------------------------------------------------------------
// Expert scoring via LLM
// ---------------------------------------------------------------------------

async function scoreWithExpert(
  expert: ExpertPersona,
  content: string,
  contentType: string,
  model: string,
): Promise<ExpertScore> {
  const prompt = `You are ${expert.name}, a ${expert.role} expert.
Your evaluation focus: ${expert.focus}

Rate the following ${contentType.replace(/_/g, ' ')} on a scale of 0-100.

CONTENT TO EVALUATE:
---
${content}
---

Respond with ONLY valid JSON:
{"score": <number 0-100>, "feedback": "<2-3 sentences of specific, actionable feedback>"}`;

  const result = await routedCompletion({
    model,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 300,
    temperature: 0.3,
  });

  try {
    const parsed = JSON.parse(result.content.replace(/```json?\n?/g, '').replace(/```/g, ''));
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    return {
      expertId: expert.id,
      expertName: expert.name,
      score,
      feedback: String(parsed.feedback || ''),
      weight: expert.weight,
      weightedScore: score * expert.weight,
    };
  } catch {
    return {
      expertId: expert.id,
      expertName: expert.name,
      score: 50,
      feedback: 'Unable to parse expert score — defaulting to 50.',
      weight: expert.weight,
      weightedScore: 50 * expert.weight,
    };
  }
}

/**
 * Run a single scoring round — all experts score in parallel, humanizer scores separately.
 */
async function runScoringRound(
  content: string,
  experts: ExpertPersona[],
  contentType: string,
  model: string,
  roundNumber: number,
  humanizerWeight: number,
): Promise<PanelRoundResult> {
  // Non-humanizer experts score via LLM
  const llmExperts = experts.filter(e => e.id !== 'humanizer');
  const llmScores = await Promise.all(
    llmExperts.map(expert => scoreWithExpert(expert, content, contentType, model)),
  );

  // Humanizer scores via pattern detection (deterministic — no LLM needed)
  const humanizerResult = scanForSlop(content);
  const humanizerExpert = experts.find(e => e.id === 'humanizer');
  const humanizerScore: ExpertScore = {
    expertId: 'humanizer',
    expertName: 'Humanizer',
    score: humanizerResult.score,
    feedback: humanizerResult.summary,
    weight: humanizerWeight,
    weightedScore: humanizerResult.score * humanizerWeight,
  };

  const allScores = [...llmScores, humanizerScore];

  // Weighted average
  const totalWeight = allScores.reduce((sum, s) => sum + s.weight, 0);
  const weightedAverage = totalWeight > 0
    ? allScores.reduce((sum, s) => sum + s.weightedScore, 0) / totalWeight
    : 0;

  const targetScore = 90;
  const passed = weightedAverage >= targetScore;

  // Generate rewrite instructions if failed
  let rewriteInstructions: string | null = null;
  if (!passed) {
    const lowScorers = allScores.filter(s => s.score < targetScore).sort((a, b) => a.score - b.score);
    const expertFeedback = lowScorers
      .slice(0, 5)
      .map(s => `[${s.expertName} — ${s.score}/100]: ${s.feedback}`)
      .join('\n');

    const humanizerInstructions = humanizerResult.passed
      ? ''
      : `\n\nHumanizer issues:\n${generateRewriteInstructions(humanizerResult)}`;

    rewriteInstructions = `Round ${roundNumber} scored ${weightedAverage.toFixed(1)}/100 (need ${targetScore}+).\n\nExpert feedback:\n${expertFeedback}${humanizerInstructions}`;
  }

  return {
    round: roundNumber,
    scores: allScores,
    weightedAverage,
    humanizerResult,
    finalScore: weightedAverage,
    passed,
    rewriteInstructions,
  };
}

/**
 * Request an LLM rewrite based on panel feedback.
 */
async function requestRewrite(
  content: string,
  instructions: string,
  contentType: string,
  model: string,
): Promise<string> {
  const prompt = `Rewrite the following ${contentType.replace(/_/g, ' ')} based on the expert panel feedback below. Maintain the same topic, key points, and approximate length, but fix ALL identified issues.

EXPERT PANEL FEEDBACK:
${instructions}

ORIGINAL CONTENT:
---
${content}
---

Return ONLY the rewritten content — no explanations, no meta-commentary.`;

  const result = await routedCompletion({
    model,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4096,
    temperature: 0.7,
  });

  return result.content.trim();
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Run the full Expert Panel scoring engine on content.
 *
 * Assembles 7-10 expert personas, scores content across all dimensions,
 * and iteratively rewrites (up to maxRounds) until the target score is met.
 *
 * @param content - The content to evaluate and optionally improve
 * @param config - Panel configuration
 * @returns ExpertPanelResult with final score, rounds, and best content
 */
export async function runExpertPanel(
  content: string,
  config: ExpertPanelConfig,
): Promise<ExpertPanelResult> {
  const {
    contentType,
    targetScore = 90,
    maxRounds = 3,
    model = 'anthropic/claude-sonnet-4-5',
    humanizerWeight = 1.5,
  } = config;

  const experts = assemblePanel(contentType);
  const rounds: PanelRoundResult[] = [];
  let currentContent = content;
  let bestContent = content;
  let bestScore = 0;

  for (let round = 1; round <= maxRounds; round++) {
    const result = await runScoringRound(
      currentContent,
      experts,
      contentType,
      model,
      round,
      humanizerWeight,
    );

    // Override target from config
    result.passed = result.finalScore >= targetScore;
    rounds.push(result);

    if (result.finalScore > bestScore) {
      bestScore = result.finalScore;
      bestContent = currentContent;
    }

    if (result.passed) break;

    // Rewrite for next round (unless this is the last round)
    if (round < maxRounds && result.rewriteInstructions) {
      currentContent = await requestRewrite(
        currentContent,
        result.rewriteInstructions,
        contentType,
        model,
      );
    }
  }

  const lastRound = rounds[rounds.length - 1]!;
  const summary = lastRound.passed
    ? `Expert panel passed at ${lastRound.finalScore.toFixed(1)}/100 after ${rounds.length} round(s).`
    : `Expert panel scored ${bestScore.toFixed(1)}/100 after ${rounds.length} round(s) — below the ${targetScore} target.`;

  return {
    finalScore: bestScore,
    passed: lastRound.passed,
    totalRounds: rounds.length,
    rounds,
    bestContent,
    summary,
  };
}

/**
 * Compare multiple content variants using the expert panel.
 * Scores each variant independently and returns them ranked.
 */
export async function compareVariants(
  variants: string[],
  config: ExpertPanelConfig,
): Promise<Array<{ variant: number; result: ExpertPanelResult }>> {
  const results = await Promise.all(
    variants.map(async (content, idx) => ({
      variant: idx,
      result: await runExpertPanel(content, { ...config, maxRounds: 1 }),
    })),
  );

  return results.sort((a, b) => b.result.finalScore - a.result.finalScore);
}
