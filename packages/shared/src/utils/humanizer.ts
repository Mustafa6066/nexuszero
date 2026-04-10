/**
 * AI Humanizer / Slop Detector
 *
 * Detects 24 common AI writing patterns ("slop") and scores content
 * for human-like quality. Used by Expert Panel, Content Writer Agent,
 * and any handler generating LLM content for publication.
 *
 * Ported from: ai-marketing-skills content-ops/experts/humanizer.md, x-longform-post
 */

/** Individual slop pattern definition */
export interface SlopPattern {
  id: string;
  label: string;
  description: string;
  /** Regex or keyword patterns to match */
  patterns: RegExp[];
  /** Score deduction per occurrence (0-5) */
  deduction: number;
  /** Maximum deduction from this pattern */
  maxDeduction: number;
}

/** Result of a humanizer scan */
export interface HumanizerResult {
  /** Overall score 0-100 (100 = perfectly human) */
  score: number;
  /** Whether content passes the quality bar (score >= threshold) */
  passed: boolean;
  /** Threshold used */
  threshold: number;
  /** Individual pattern violations found */
  violations: HumanizerViolation[];
  /** Summary of issues for feedback */
  summary: string;
}

export interface HumanizerViolation {
  patternId: string;
  label: string;
  occurrences: number;
  deduction: number;
  examples: string[];
}

/**
 * The 24 AI slop patterns — common tells of LLM-generated content.
 */
export const SLOP_PATTERNS: SlopPattern[] = [
  {
    id: 'significance_inflation',
    label: 'Significance Inflation',
    description: 'Overuse of "groundbreaking", "revolutionary", "game-changing" etc.',
    patterns: [
      /\b(groundbreaking|revolutionary|game[- ]changing|transformative|paradigm[- ]shifting|unprecedented)\b/gi,
    ],
    deduction: 3,
    maxDeduction: 9,
  },
  {
    id: 'negative_parallelism',
    label: 'Negative Parallelism',
    description: '"It\'s not X, it\'s Y" structure overuse',
    patterns: [
      /it'?s not (?:just |merely |simply )?[\w\s]+[,;] it'?s/gi,
    ],
    deduction: 2,
    maxDeduction: 6,
  },
  {
    id: 'banned_vocabulary',
    label: 'Banned AI Vocabulary',
    description: 'Words that scream AI authorship',
    patterns: [
      /\b(delve|utilize|leverage|facilitate|spearheaded|synergy|holistic|robust|seamless|cutting[- ]edge|innovative|moreover|furthermore|nevertheless|comprehensive|streamline|landscape|realm|tapestry|multifaceted|pivotal|embark)\b/gi,
    ],
    deduction: 2,
    maxDeduction: 10,
  },
  {
    id: 'vague_attribution',
    label: 'Vague Attributions',
    description: '"Studies show", "experts agree" without citation',
    patterns: [
      /\b(studies show|research suggests|experts agree|data indicates|evidence suggests|scientists believe|according to experts)\b/gi,
    ],
    deduction: 3,
    maxDeduction: 9,
  },
  {
    id: 'empty_connector',
    label: 'Empty Connectors',
    description: 'Filler transitions that add no meaning',
    patterns: [
      /\b(in today'?s (?:world|landscape|digital age|fast[- ]paced)|at the end of the day|when it comes to|it goes without saying|needless to say|in the grand scheme)\b/gi,
    ],
    deduction: 2,
    maxDeduction: 6,
  },
  {
    id: 'triple_structure',
    label: 'Triple Structure Overuse',
    description: 'Excessive "X, Y, and Z" lists',
    patterns: [
      /\w+, \w+, and \w+/g,
    ],
    deduction: 1,
    maxDeduction: 4,
  },
  {
    id: 'exclamation_overuse',
    label: 'Exclamation Overuse',
    description: 'Too many exclamation marks',
    patterns: [/!/g],
    deduction: 1,
    maxDeduction: 5,
  },
  {
    id: 'emoji_overuse',
    label: 'Emoji Overuse',
    description: 'Excessive emoji usage in professional content',
    patterns: [/[\u{1F300}-\u{1F9FF}]/gu],
    deduction: 1,
    maxDeduction: 5,
  },
  {
    id: 'passive_voice',
    label: 'Passive Voice Overuse',
    description: 'Excessive passive constructions',
    patterns: [
      /\b(is|are|was|were|been|being) (\w+ed|built|made|seen|done|given|known|shown|found)\b/gi,
    ],
    deduction: 1,
    maxDeduction: 5,
  },
  {
    id: 'hedging',
    label: 'Excessive Hedging',
    description: 'Over-qualifying every statement',
    patterns: [
      /\b(might potentially|could possibly|may perhaps|it seems like|it appears that|in some ways|to some extent|arguably|presumably|ostensibly)\b/gi,
    ],
    deduction: 2,
    maxDeduction: 6,
  },
  {
    id: 'conclusion_cliche',
    label: 'Conclusion Cliches',
    description: 'Predictable wrap-up phrases',
    patterns: [
      /\b(in conclusion|to sum up|to summarize|all in all|the bottom line is|at the end of the day|moving forward|going forward|looking ahead)\b/gi,
    ],
    deduction: 3,
    maxDeduction: 6,
  },
  {
    id: 'question_hook',
    label: 'Rhetorical Question Hook',
    description: '"Have you ever wondered" opening patterns',
    patterns: [
      /\b(have you ever wondered|what if I told you|imagine a world|picture this|let me ask you|but here'?s the (?:thing|kicker|twist))\b/gi,
    ],
    deduction: 3,
    maxDeduction: 6,
  },
  {
    id: 'value_stacking',
    label: 'Value Stacking',
    description: 'Empty value claims without proof',
    patterns: [
      /\b(unlock(?:ing)? (?:the )?(?:full |true )?potential|take (?:it |things )?to the next level|elevate your|supercharge your|turbocharge your|10x your)\b/gi,
    ],
    deduction: 3,
    maxDeduction: 9,
  },
  {
    id: 'false_intimacy',
    label: 'False Intimacy',
    description: 'Forced personal connection',
    patterns: [
      /\b(I'?m (?:going to be )?honest with you|here'?s (?:the )?(?:real )?truth|let me be (?:real|transparent|candid)|between you and me|I'?ll let you in on)\b/gi,
    ],
    deduction: 2,
    maxDeduction: 4,
  },
  {
    id: 'listicle_intro',
    label: 'Listicle Intro Pattern',
    description: '"Here are N ways to..." structure',
    patterns: [
      /here are \d+ (?:ways|tips|strategies|reasons|steps|things|secrets|hacks)\b/gi,
    ],
    deduction: 2,
    maxDeduction: 4,
  },
  {
    id: 'power_word_stuffing',
    label: 'Power Word Stuffing',
    description: 'Excessive marketing power words',
    patterns: [
      /\b(amazing|incredible|unbelievable|mind[- ]blowing|insane|massive|explosive|skyrocket|crushing it|dominate|ultimate|exclusive|proven|secret|hack)\b/gi,
    ],
    deduction: 1,
    maxDeduction: 5,
  },
  {
    id: 'filler_phrases',
    label: 'Filler Phrases',
    description: 'Phrases that add zero information',
    patterns: [
      /\b(it'?s worth (?:noting|mentioning)|interestingly enough|as a matter of fact|the fact of the matter is|with that (?:being )?said|that being said)\b/gi,
    ],
    deduction: 2,
    maxDeduction: 6,
  },
  {
    id: 'monotone_sentence_length',
    label: 'Monotone Sentence Length',
    description: 'All sentences roughly the same length (low variance)',
    patterns: [], // Dynamic check — no regex
    deduction: 5,
    maxDeduction: 5,
  },
  {
    id: 'colon_intro',
    label: 'Colon Introduction Pattern',
    description: '"Here\'s the thing:" repeated structure',
    patterns: [
      /(?:here'?s|that'?s) (?:the |what'?s )?(?:thing|point|reality|truth):/gi,
    ],
    deduction: 2,
    maxDeduction: 4,
  },
  {
    id: 'generic_analogy',
    label: 'Generic Analogy',
    description: 'Overused analogies (chess, GPS, orchestra)',
    patterns: [
      /\b(?:like a (?:chess|orchestra|symphony|compass|GPS|roadmap|blueprint|puzzle|jigsaw))\b/gi,
    ],
    deduction: 2,
    maxDeduction: 4,
  },
  {
    id: 'false_urgency',
    label: 'False Urgency',
    description: 'Manufactured urgency without basis',
    patterns: [
      /\b(don'?t miss (?:out|this)|act now|limited time|before it'?s too late|this won'?t last|time is running out)\b/gi,
    ],
    deduction: 2,
    maxDeduction: 4,
  },
  {
    id: 'empty_emphasis',
    label: 'Empty Emphasis',
    description: 'Bold/italic for emphasis without substance',
    patterns: [
      /\*{1,2}.{1,30}\*{1,2}/g,
    ],
    deduction: 1,
    maxDeduction: 3,
  },
  {
    id: 'transition_overuse',
    label: 'Transition Overuse',
    description: 'Starting every paragraph with a transition',
    patterns: [
      /^(however|additionally|consequently|subsequently|meanwhile|alternatively|conversely|ultimately|essentially)\b/gim,
    ],
    deduction: 2,
    maxDeduction: 6,
  },
  {
    id: 'bracket_instruction_leak',
    label: 'Bracket Instruction Leak',
    description: 'Leaked prompt instructions in output',
    patterns: [
      /\[(?:insert|add|include|placeholder|your|fill in)[^\]]*\]/gi,
    ],
    deduction: 10,
    maxDeduction: 10,
  },
];

/**
 * Detect sentence length monotony (low variance = robotic).
 * Returns an occurrence count of 1 if monotone, 0 otherwise.
 */
function detectMonotoneSentenceLength(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 5) return 0;

  const lengths = sentences.map(s => s.trim().split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / lengths.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  // Coefficient of variation below 0.3 = monotone
  return cv < 0.3 ? 1 : 0;
}

/**
 * Scan content for AI slop patterns and return a score.
 *
 * @param content - The text to analyze
 * @param threshold - Minimum score to pass (default 90)
 * @returns HumanizerResult with score, violations, and pass/fail
 */
export function scanForSlop(content: string, threshold = 90): HumanizerResult {
  const violations: HumanizerViolation[] = [];
  let totalDeduction = 0;

  for (const pattern of SLOP_PATTERNS) {
    if (pattern.id === 'monotone_sentence_length') {
      const count = detectMonotoneSentenceLength(content);
      if (count > 0) {
        const deduction = Math.min(pattern.deduction * count, pattern.maxDeduction);
        totalDeduction += deduction;
        violations.push({
          patternId: pattern.id,
          label: pattern.label,
          occurrences: count,
          deduction,
          examples: ['Sentence length variance too low — robotic rhythm detected'],
        });
      }
      continue;
    }

    let occurrences = 0;
    const examples: string[] = [];

    for (const regex of pattern.patterns) {
      // Reset lastIndex for stateful regexes
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        occurrences++;
        if (examples.length < 3) {
          examples.push(match[0]);
        }
        // Guard against infinite loops on zero-length matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    if (occurrences > 0) {
      const deduction = Math.min(pattern.deduction * occurrences, pattern.maxDeduction);
      totalDeduction += deduction;
      violations.push({
        patternId: pattern.id,
        label: pattern.label,
        occurrences,
        deduction,
        examples,
      });
    }
  }

  const score = Math.max(0, 100 - totalDeduction);
  const passed = score >= threshold;

  // Build summary
  const summary = violations.length === 0
    ? 'Content reads naturally — no AI patterns detected.'
    : `Score ${score}/100. Found ${violations.length} pattern type(s): ${violations
        .sort((a, b) => b.deduction - a.deduction)
        .slice(0, 5)
        .map(v => `${v.label} (−${v.deduction})`)
        .join(', ')}.`;

  return { score, passed, threshold, violations, summary };
}

/**
 * Generate rewrite instructions from humanizer violations.
 * Used as feedback for the LLM to fix detected slop patterns.
 */
export function generateRewriteInstructions(result: HumanizerResult): string {
  if (result.passed) return 'Content passes humanizer check — no changes needed.';

  const instructions = result.violations
    .sort((a, b) => b.deduction - a.deduction)
    .map(v => {
      const exampleStr = v.examples.length > 0
        ? ` Examples found: "${v.examples.slice(0, 2).join('", "')}".`
        : '';
      return `- FIX: ${v.label} (−${v.deduction} pts, ${v.occurrences} occurrence(s)).${exampleStr}`;
    })
    .join('\n');

  return `Humanizer score: ${result.score}/100 (need ${result.threshold}+).\n\nRewrite to fix:\n${instructions}\n\nGeneral rules:\n- Replace AI vocabulary with plain, specific language\n- Vary sentence length (mix short punchy + longer explanatory)\n- Use concrete examples instead of vague claims\n- Remove filler phrases entirely\n- Write like a sharp practitioner, not a motivational poster`;
}
