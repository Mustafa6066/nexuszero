/**
 * @nexuszero/eval — AI Agent Output Evaluation Framework
 *
 * Configurable eval suites for AI agent outputs.
 * Define scenarios + pass/fail criteria. Run per-agent or globally.
 *
 * Criterion types: contains, not_contains, regex, max_length, min_length,
 * json_valid, no_hallucination, preserves_names, sentiment, custom_fn
 *
 * Ported from: ai-marketing-skills/eval
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type CriterionType =
  | 'contains'
  | 'not_contains'
  | 'regex'
  | 'max_length'
  | 'min_length'
  | 'json_valid'
  | 'no_hallucination'
  | 'preserves_names'
  | 'sentiment'
  | 'custom_fn';

export interface EvalCriterion {
  type: CriterionType;
  value?: string | number | string[];
  /** Custom function for 'custom_fn' type (output: string) => boolean */
  fn?: (output: string) => boolean;
  weight?: number;
  description?: string;
}

export interface EvalScenario {
  id: string;
  name: string;
  description?: string;
  input: any;
  criteria: EvalCriterion[];
  /** Optional: expected output for baseline comparison */
  baseline?: string;
  tags?: string[];
}

export interface EvalSuite {
  name: string;
  agentType: string;
  taskType: string;
  scenarios: EvalScenario[];
}

export interface CriterionResult {
  type: CriterionType;
  passed: boolean;
  message: string;
  weight: number;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  score: number;
  criterionResults: CriterionResult[];
  output: string;
  durationMs: number;
  regressionDetected?: boolean;
}

export interface SuiteResult {
  suiteName: string;
  agentType: string;
  taskType: string;
  passRate: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  averageScore: number;
  scenarioResults: ScenarioResult[];
  durationMs: number;
}

// ─── Criterion Evaluators ────────────────────────────────────────────────────

function evaluateCriterion(criterion: EvalCriterion, output: string): CriterionResult {
  const weight = criterion.weight ?? 1;

  switch (criterion.type) {
    case 'contains': {
      const target = String(criterion.value || '');
      const passed = output.toLowerCase().includes(target.toLowerCase());
      return { type: criterion.type, passed, message: passed ? `Contains "${target}"` : `Missing "${target}"`, weight };
    }

    case 'not_contains': {
      const target = String(criterion.value || '');
      const passed = !output.toLowerCase().includes(target.toLowerCase());
      return { type: criterion.type, passed, message: passed ? `Correctly omits "${target}"` : `Incorrectly contains "${target}"`, weight };
    }

    case 'regex': {
      const pattern = new RegExp(String(criterion.value || ''), 'i');
      const passed = pattern.test(output);
      return { type: criterion.type, passed, message: passed ? `Matches pattern` : `Does not match pattern: ${criterion.value}`, weight };
    }

    case 'max_length': {
      const maxLen = Number(criterion.value || 0);
      const passed = output.length <= maxLen;
      return { type: criterion.type, passed, message: passed ? `Length ${output.length} ≤ ${maxLen}` : `Length ${output.length} exceeds ${maxLen}`, weight };
    }

    case 'min_length': {
      const minLen = Number(criterion.value || 0);
      const passed = output.length >= minLen;
      return { type: criterion.type, passed, message: passed ? `Length ${output.length} ≥ ${minLen}` : `Length ${output.length} below ${minLen}`, weight };
    }

    case 'json_valid': {
      let passed = false;
      try {
        JSON.parse(output.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        passed = true;
      } catch {
        passed = false;
      }
      return { type: criterion.type, passed, message: passed ? 'Valid JSON' : 'Invalid JSON', weight };
    }

    case 'no_hallucination': {
      // Check that all required names/terms from value array appear correctly
      const terms = Array.isArray(criterion.value) ? criterion.value : [];
      const missing = terms.filter(t => !output.includes(t));
      const passed = missing.length === 0;
      return {
        type: criterion.type,
        passed,
        message: passed ? 'No hallucination detected' : `Missing expected terms: ${missing.join(', ')}`,
        weight,
      };
    }

    case 'preserves_names': {
      const names = Array.isArray(criterion.value) ? criterion.value : [];
      const preserved = names.filter(n => output.includes(n));
      const passed = preserved.length === names.length;
      return {
        type: criterion.type,
        passed,
        message: passed ? 'All names preserved' : `Missing names: ${names.filter(n => !output.includes(n)).join(', ')}`,
        weight,
      };
    }

    case 'sentiment': {
      const expected = String(criterion.value || 'neutral');
      // Simple heuristic sentiment check
      const positiveWords = ['great', 'excellent', 'good', 'amazing', 'wonderful', 'success', 'improved', 'growth'];
      const negativeWords = ['bad', 'poor', 'terrible', 'failed', 'decline', 'loss', 'problem', 'issue'];
      const lower = output.toLowerCase();
      const posCount = positiveWords.filter(w => lower.includes(w)).length;
      const negCount = negativeWords.filter(w => lower.includes(w)).length;
      let detected = 'neutral';
      if (posCount > negCount + 2) detected = 'positive';
      else if (negCount > posCount + 2) detected = 'negative';
      const passed = detected === expected;
      return { type: criterion.type, passed, message: `Sentiment: ${detected} (expected ${expected})`, weight };
    }

    case 'custom_fn': {
      if (!criterion.fn) {
        return { type: criterion.type, passed: false, message: 'No custom function provided', weight };
      }
      const passed = criterion.fn(output);
      return { type: criterion.type, passed, message: passed ? 'Custom check passed' : 'Custom check failed', weight };
    }

    default:
      return { type: criterion.type, passed: false, message: `Unknown criterion type: ${criterion.type}`, weight };
  }
}

// ─── Scenario Runner ─────────────────────────────────────────────────────────

export async function runScenario(
  scenario: EvalScenario,
  handler: (input: any) => Promise<string>,
): Promise<ScenarioResult> {
  const start = Date.now();
  let output = '';

  try {
    output = await handler(scenario.input);
  } catch (e) {
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed: false,
      score: 0,
      criterionResults: [{ type: 'custom_fn', passed: false, message: `Handler threw: ${(e as Error).message}`, weight: 1 }],
      output: '',
      durationMs: Date.now() - start,
    };
  }

  const criterionResults = scenario.criteria.map(c => evaluateCriterion(c, output));
  const totalWeight = criterionResults.reduce((sum, r) => sum + r.weight, 0);
  const passedWeight = criterionResults.filter(r => r.passed).reduce((sum, r) => sum + r.weight, 0);
  const score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0;
  const passed = criterionResults.every(r => r.passed);

  // Regression detection via baseline comparison
  let regressionDetected: boolean | undefined;
  if (scenario.baseline) {
    const baselineCriterionResults = scenario.criteria.map(c => evaluateCriterion(c, scenario.baseline!));
    const baselinePassedWeight = baselineCriterionResults.filter(r => r.passed).reduce((sum, r) => sum + r.weight, 0);
    const baselineScore = totalWeight > 0 ? Math.round((baselinePassedWeight / totalWeight) * 100) : 0;
    if (score < baselineScore) {
      regressionDetected = true;
    }
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    passed,
    score,
    criterionResults,
    output,
    durationMs: Date.now() - start,
    regressionDetected,
  };
}

// ─── Suite Runner ────────────────────────────────────────────────────────────

export async function runSuite(
  suite: EvalSuite,
  handler: (input: any) => Promise<string>,
): Promise<SuiteResult> {
  const start = Date.now();
  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of suite.scenarios) {
    const result = await runScenario(scenario, handler);
    scenarioResults.push(result);
  }

  const passedScenarios = scenarioResults.filter(r => r.passed).length;
  const failedScenarios = scenarioResults.filter(r => !r.passed).length;
  const passRate = suite.scenarios.length > 0 ? Math.round((passedScenarios / suite.scenarios.length) * 100) : 0;
  const averageScore = scenarioResults.length > 0
    ? Math.round(scenarioResults.reduce((sum, r) => sum + r.score, 0) / scenarioResults.length)
    : 0;

  return {
    suiteName: suite.name,
    agentType: suite.agentType,
    taskType: suite.taskType,
    passRate,
    totalScenarios: suite.scenarios.length,
    passedScenarios,
    failedScenarios,
    averageScore,
    scenarioResults,
    durationMs: Date.now() - start,
  };
}

// ─── Multi-Suite Runner ──────────────────────────────────────────────────────

export interface MultiSuiteResult {
  totalSuites: number;
  passedSuites: number;
  overallPassRate: number;
  results: SuiteResult[];
  durationMs: number;
}

export async function runMultipleSuites(
  suites: EvalSuite[],
  handlers: Record<string, (input: any) => Promise<string>>,
): Promise<MultiSuiteResult> {
  const start = Date.now();
  const results: SuiteResult[] = [];

  for (const suite of suites) {
    const handlerKey = `${suite.agentType}:${suite.taskType}`;
    const handler = handlers[handlerKey] || handlers[suite.agentType];
    if (!handler) {
      results.push({
        suiteName: suite.name,
        agentType: suite.agentType,
        taskType: suite.taskType,
        passRate: 0,
        totalScenarios: suite.scenarios.length,
        passedScenarios: 0,
        failedScenarios: suite.scenarios.length,
        averageScore: 0,
        scenarioResults: suite.scenarios.map(s => ({
          scenarioId: s.id,
          scenarioName: s.name,
          passed: false,
          score: 0,
          criterionResults: [{ type: 'custom_fn' as CriterionType, passed: false, message: `No handler for ${handlerKey}`, weight: 1 }],
          output: '',
          durationMs: 0,
        })),
        durationMs: 0,
      });
      continue;
    }
    results.push(await runSuite(suite, handler));
  }

  const passedSuites = results.filter(r => r.passRate >= 80).length;
  const overallPassRate = results.length > 0 ? Math.round((passedSuites / results.length) * 100) : 0;

  return {
    totalSuites: suites.length,
    passedSuites,
    overallPassRate,
    results,
    durationMs: Date.now() - start,
  };
}

// ─── Report Formatter ────────────────────────────────────────────────────────

export function formatSuiteReport(result: SuiteResult): string {
  const lines: string[] = [];
  lines.push(`\n═══ ${result.suiteName} ═══`);
  lines.push(`Agent: ${result.agentType} | Task: ${result.taskType}`);
  lines.push(`Pass Rate: ${result.passRate}% (${result.passedScenarios}/${result.totalScenarios})`);
  lines.push(`Avg Score: ${result.averageScore}/100 | Duration: ${result.durationMs}ms\n`);

  for (const sr of result.scenarioResults) {
    const icon = sr.passed ? '✓' : '✗';
    const regression = sr.regressionDetected ? ' [REGRESSION]' : '';
    lines.push(`  ${icon} ${sr.scenarioName} — ${sr.score}/100${regression}`);
    for (const cr of sr.criterionResults.filter(c => !c.passed)) {
      lines.push(`    ↳ FAIL: ${cr.message}`);
    }
  }

  return lines.join('\n');
}
