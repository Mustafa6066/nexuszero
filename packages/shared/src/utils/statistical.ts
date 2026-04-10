/**
 * Statistical utility functions for A/B testing and anomaly detection.
 * Used by the Creative Engine's A/B test manager and Data Nexus agent.
 */

/** Normal distribution CDF approximation (Abramowitz & Stegun) */
export function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  // erf approximation: input must be x/√2 so that CDF(x) = 0.5*(1 + erf(x/√2))
  const erfInput = absX / Math.SQRT2;
  const t = 1.0 / (1.0 + p * erfInput);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-erfInput * erfInput);

  return 0.5 * (1.0 + sign * y);
}

/** Z-score calculation */
export function zScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/** P-value from z-score (two-tailed) */
export function pValueFromZScore(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/**
 * Two-proportion Z-test for A/B testing.
 * Tests if conversion rate of variant B is significantly different from variant A.
 */
export function twoProportionZTest(
  conversionsA: number,
  trialsA: number,
  conversionsB: number,
  trialsB: number,
): { zScore: number; pValue: number; significant: boolean } {
  if (trialsA === 0 || trialsB === 0) {
    return { zScore: 0, pValue: 1, significant: false };
  }

  const pA = conversionsA / trialsA;
  const pB = conversionsB / trialsB;
  const pPooled = (conversionsA + conversionsB) / (trialsA + trialsB);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / trialsA + 1 / trialsB));

  if (se === 0) return { zScore: 0, pValue: 1, significant: false };

  const z = (pB - pA) / se;
  const pVal = pValueFromZScore(z);

  return {
    zScore: z,
    pValue: pVal,
    significant: pVal < 0.05,
  };
}

/**
 * Bayesian A/B test using Beta-Binomial model.
 * Returns probability that each variant is the best.
 * Uses Monte Carlo simulation with configurable sample count.
 */
export function bayesianABTest(
  variants: Array<{ conversions: number; trials: number }>,
  simulations = 10000,
): number[] {
  if (variants.length === 0) return [];
  if (variants.length === 1) return [1.0];

  // Beta distribution sampling using Marsaglia and Tsang's method
  const winCounts = new Array(variants.length).fill(0) as number[];

  for (let sim = 0; sim < simulations; sim++) {
    let maxSample = -1;
    let maxIdx = 0;

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]!;
      // Beta prior: alpha = 1 + conversions, beta = 1 + (trials - conversions)
      const alpha = 1 + v.conversions;
      const beta = 1 + (v.trials - v.conversions);
      const sample = sampleBeta(alpha, beta);
      if (sample > maxSample) {
        maxSample = sample;
        maxIdx = i;
      }
    }

    winCounts[maxIdx]!++;
  }

  return winCounts.map(count => count / simulations);
}

/** Sample from a Beta distribution using the gamma distribution method */
function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

/** Sample from a Gamma distribution using Marsaglia and Tsang's method */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // For shape < 1, use the relation: Gamma(shape) = Gamma(shape+1) * U^(1/shape)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = randomNormal();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Generate a standard normal random variable using Box-Muller transform */
function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Chi-squared test for independence.
 * Tests if the distribution of outcomes across variants is significantly different.
 */
export function chiSquaredTest(
  observed: number[][],
): { chiSquared: number; degreesOfFreedom: number; pValue: number; significant: boolean } {
  const rows = observed.length;
  if (rows === 0 || !observed[0]) return { chiSquared: 0, degreesOfFreedom: 0, pValue: 1, significant: false };
  const cols = observed[0].length;

  // Calculate row and column totals
  const rowTotals = observed.map(row => row.reduce((s, v) => s + v, 0));
  const colTotals = new Array(cols).fill(0) as number[];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      colTotals[c]! += observed[r]![c]!;
    }
  }
  const total = rowTotals.reduce((s, v) => s + v, 0);

  if (total === 0) return { chiSquared: 0, degreesOfFreedom: 0, pValue: 1, significant: false };

  // Calculate chi-squared statistic
  let chiSq = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const expected = (rowTotals[r]! * colTotals[c]!) / total;
      if (expected > 0) {
        const diff = observed[r]![c]! - expected;
        chiSq += (diff * diff) / expected;
      }
    }
  }

  const df = (rows - 1) * (cols - 1);
  // Approximate p-value using Wilson-Hilferty transformation
  const pValue = df > 0 ? 1 - normalCdf((Math.pow(chiSq / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df))) : 1;

  return {
    chiSquared: chiSq,
    degreesOfFreedom: df,
    pValue: Math.max(0, Math.min(1, pValue)),
    significant: pValue < 0.05,
  };
}

/** Simple moving average */
export function movingAverage(values: number[], windowSize: number): number[] {
  if (windowSize <= 0 || values.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    result.push(window.reduce((s, v) => s + v, 0) / window.length);
  }
  return result;
}

/** Detect anomalies using z-score method */
export function detectAnomalies(
  values: number[],
  threshold = 2.5,
): Array<{ index: number; value: number; zScore: number }> {
  if (values.length < 3) return [];

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return [];

  const anomalies: Array<{ index: number; value: number; zScore: number }> = [];
  for (let i = 0; i < values.length; i++) {
    const z = Math.abs((values[i]! - mean) / stdDev);
    if (z > threshold) {
      anomalies.push({ index: i, value: values[i]!, zScore: z });
    }
  }
  return anomalies;
}

/**
 * Simple linear regression.
 * Returns slope, intercept, and r-squared.
 */
export function linearRegression(
  x: number[],
  y: number[],
): { slope: number; intercept: number; rSquared: number } {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0, rSquared: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]!;
    sumY += y[i]!;
    sumXY += x[i]! * y[i]!;
    sumX2 += x[i]! * x[i]!;
    sumY2 += y[i]! * y[i]!;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const ssRes = y.reduce((s, yi, i) => s + (yi - (slope * x[i]! + intercept)) ** 2, 0);
  const meanY = sumY / n;
  const ssTot = y.reduce((s, yi) => s + (yi - meanY) ** 2, 0);
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

// ---------------------------------------------------------------------------
// Bootstrap & non-parametric tests (Growth Engine / Experiment Engine)
// Ported from: ai-marketing-skills growth-engine/experiment-engine.py
// ---------------------------------------------------------------------------

/**
 * Bootstrap confidence interval for a metric.
 * Resamples with replacement and returns [lower, upper] bounds.
 *
 * @param values - Observed data points
 * @param confidenceLevel - Confidence level (default 0.95)
 * @param resamples - Number of bootstrap resamples (default 1000)
 * @returns { mean, lower, upper, confidenceLevel }
 */
export function bootstrapConfidenceInterval(
  values: number[],
  confidenceLevel = 0.95,
  resamples = 1000,
): { mean: number; lower: number; upper: number; confidenceLevel: number } {
  if (values.length === 0) return { mean: 0, lower: 0, upper: 0, confidenceLevel };
  if (values.length === 1) return { mean: values[0]!, lower: values[0]!, upper: values[0]!, confidenceLevel };

  const n = values.length;
  const means: number[] = [];

  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += values[Math.floor(Math.random() * n)]!;
    }
    means.push(sum / n);
  }

  means.sort((a, b) => a - b);

  const alpha = 1 - confidenceLevel;
  const lowerIdx = Math.floor((alpha / 2) * resamples);
  const upperIdx = Math.floor((1 - alpha / 2) * resamples);
  const overallMean = values.reduce((a, b) => a + b, 0) / n;

  return {
    mean: overallMean,
    lower: means[lowerIdx]!,
    upper: means[upperIdx]!,
    confidenceLevel,
  };
}

/**
 * Mann-Whitney U test (Wilcoxon rank-sum test).
 * Non-parametric test for comparing two independent samples.
 *
 * @returns { uStat, zScore, pValue, significant }
 */
export function mannWhitneyUTest(
  sampleA: number[],
  sampleB: number[],
  alpha = 0.05,
): { uStat: number; zScore: number; pValue: number; significant: boolean } {
  const nA = sampleA.length;
  const nB = sampleB.length;

  if (nA === 0 || nB === 0) {
    return { uStat: 0, zScore: 0, pValue: 1, significant: false };
  }

  // Combine and rank
  const combined = [
    ...sampleA.map(v => ({ value: v, group: 'A' as const })),
    ...sampleB.map(v => ({ value: v, group: 'B' as const })),
  ];
  combined.sort((a, b) => a.value - b.value);

  // Assign ranks (handle ties with average rank)
  const ranks = new Array(combined.length).fill(0) as number[];
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j]!.value === combined[i]!.value) {
      j++;
    }
    const avgRank = (i + 1 + j) / 2; // Average rank for ties
    for (let k = i; k < j; k++) {
      ranks[k] = avgRank;
    }
    i = j;
  }

  // Sum ranks for group A
  let rankSumA = 0;
  for (let idx = 0; idx < combined.length; idx++) {
    if (combined[idx]!.group === 'A') {
      rankSumA += ranks[idx]!;
    }
  }

  const uA = rankSumA - (nA * (nA + 1)) / 2;
  const uB = nA * nB - uA;
  const uStat = Math.min(uA, uB);

  // Normal approximation for large samples
  const meanU = (nA * nB) / 2;
  const stdU = Math.sqrt((nA * nB * (nA + nB + 1)) / 12);

  if (stdU === 0) return { uStat, zScore: 0, pValue: 1, significant: false };

  const z = (uStat - meanU) / stdU;
  const pVal = pValueFromZScore(z);

  return {
    uStat,
    zScore: z,
    pValue: pVal,
    significant: pVal < alpha,
  };
}

/**
 * Dual-threshold experiment evaluation.
 * Requires BOTH statistical significance AND minimum lift to declare a winner.
 *
 * @param control - Control group metric values
 * @param variant - Variant group metric values  
 * @param minLift - Minimum lift percentage required (default 0.15 = 15%)
 * @param alpha - Significance level (default 0.05)
 * @param trendingSampleMin - Minimum samples for "trending" status (default 15)
 */
export function evaluateExperiment(
  control: number[],
  variant: number[],
  minLift = 0.15,
  alpha = 0.05,
  trendingSampleMin = 15,
): {
  winner: 'control' | 'variant' | 'none';
  status: 'significant_winner' | 'trending' | 'inconclusive' | 'insufficient_data';
  lift: number;
  pValue: number;
  controlMean: number;
  variantMean: number;
  controlCI: { lower: number; upper: number };
  variantCI: { lower: number; upper: number };
} {
  if (control.length < 5 || variant.length < 5) {
    return {
      winner: 'none',
      status: 'insufficient_data',
      lift: 0,
      pValue: 1,
      controlMean: control.length > 0 ? control.reduce((a, b) => a + b, 0) / control.length : 0,
      variantMean: variant.length > 0 ? variant.reduce((a, b) => a + b, 0) / variant.length : 0,
      controlCI: { lower: 0, upper: 0 },
      variantCI: { lower: 0, upper: 0 },
    };
  }

  const controlCI = bootstrapConfidenceInterval(control);
  const variantCI = bootstrapConfidenceInterval(variant);
  const mwu = mannWhitneyUTest(control, variant, alpha);

  const lift = controlCI.mean !== 0
    ? (variantCI.mean - controlCI.mean) / Math.abs(controlCI.mean)
    : 0;

  const absLift = Math.abs(lift);
  const isVariantBetter = variantCI.mean > controlCI.mean;

  let winner: 'control' | 'variant' | 'none' = 'none';
  let status: 'significant_winner' | 'trending' | 'inconclusive' | 'insufficient_data';

  if (mwu.significant && absLift >= minLift) {
    // Dual threshold met
    winner = isVariantBetter ? 'variant' : 'control';
    status = 'significant_winner';
  } else if (mwu.pValue < 0.10 && control.length >= trendingSampleMin && variant.length >= trendingSampleMin) {
    // Trending — not yet significant but promising
    status = 'trending';
  } else {
    status = 'inconclusive';
  }

  return {
    winner,
    status,
    lift,
    pValue: mwu.pValue,
    controlMean: controlCI.mean,
    variantMean: variantCI.mean,
    controlCI: { lower: controlCI.lower, upper: controlCI.upper },
    variantCI: { lower: variantCI.lower, upper: variantCI.upper },
  };
}
