import { describe, it, expect } from 'vitest';
import {
  normalCdf,
  zScore,
  pValueFromZScore,
  twoProportionZTest,
  bayesianABTest,
  chiSquaredTest,
  movingAverage,
  detectAnomalies,
  linearRegression,
} from '../src/utils/statistical';

describe('normalCdf', () => {
  it('returns 0.5 for z=0', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
  });

  it('returns ~0.9772 for z=2', () => {
    expect(normalCdf(2)).toBeCloseTo(0.9772, 3);
  });

  it('is symmetric: CDF(-x) = 1 - CDF(x)', () => {
    expect(normalCdf(-1.5) + normalCdf(1.5)).toBeCloseTo(1, 4);
  });
});

describe('zScore', () => {
  it('calculates z-score correctly', () => {
    expect(zScore(15, 10, 5)).toBe(1);
    expect(zScore(5, 10, 5)).toBe(-1);
  });

  it('returns 0 when stdDev is 0', () => {
    expect(zScore(5, 10, 0)).toBe(0);
  });
});

describe('pValueFromZScore', () => {
  it('returns ~1 for z=0', () => {
    expect(pValueFromZScore(0)).toBeCloseTo(1, 2);
  });

  it('returns small value for large z', () => {
    expect(pValueFromZScore(3)).toBeLessThan(0.01);
  });
});

describe('twoProportionZTest', () => {
  it('detects significant difference', () => {
    const result = twoProportionZTest(100, 1000, 150, 1000);
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it('finds no significance with similar rates', () => {
    const result = twoProportionZTest(100, 1000, 102, 1000);
    expect(result.significant).toBe(false);
  });

  it('handles zero trials', () => {
    const result = twoProportionZTest(0, 0, 10, 100);
    expect(result.pValue).toBe(1);
    expect(result.significant).toBe(false);
  });
});

describe('bayesianABTest', () => {
  it('returns probabilities summing to 1', () => {
    const probs = bayesianABTest([
      { conversions: 50, trials: 1000 },
      { conversions: 60, trials: 1000 },
    ], 5000);
    const sum = probs.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it('favors higher conversion rate variant', () => {
    const probs = bayesianABTest([
      { conversions: 10, trials: 1000 },
      { conversions: 100, trials: 1000 },
    ], 5000);
    expect(probs[1]).toBeGreaterThan(probs[0]!);
  });

  it('returns [1] for single variant', () => {
    expect(bayesianABTest([{ conversions: 10, trials: 100 }])).toEqual([1.0]);
  });

  it('returns [] for empty', () => {
    expect(bayesianABTest([])).toEqual([]);
  });
});

describe('chiSquaredTest', () => {
  it('detects significant difference', () => {
    const result = chiSquaredTest([
      [100, 900],
      [150, 850],
    ]);
    expect(result.degreesOfFreedom).toBe(1);
    expect(result.chiSquared).toBeGreaterThan(0);
  });

  it('handles empty input', () => {
    const result = chiSquaredTest([]);
    expect(result.pValue).toBe(1);
  });
});

describe('movingAverage', () => {
  it('calculates correctly', () => {
    const result = movingAverage([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe(1); // only 1 element in window
    expect(result[2]).toBeCloseTo(2); // (1+2+3)/3
    expect(result[4]).toBeCloseTo(4); // (3+4+5)/3
  });

  it('returns empty for windowSize 0', () => {
    expect(movingAverage([1, 2, 3], 0)).toEqual([]);
  });

  it('returns empty for empty values', () => {
    expect(movingAverage([], 3)).toEqual([]);
  });
});

describe('detectAnomalies', () => {
  it('detects outliers', () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 100];
    const anomalies = detectAnomalies(values, 2);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]!.index).toBe(7);
  });

  it('returns empty for uniform data', () => {
    expect(detectAnomalies([5, 5, 5, 5, 5])).toEqual([]);
  });

  it('returns empty for less than 3 values', () => {
    expect(detectAnomalies([1, 100])).toEqual([]);
  });
});

describe('linearRegression', () => {
  it('fits a perfect line', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const result = linearRegression(x, y);
    expect(result.slope).toBeCloseTo(2);
    expect(result.intercept).toBeCloseTo(0);
    expect(result.rSquared).toBeCloseTo(1);
  });

  it('returns zero slope for constant y', () => {
    const x = [1, 2, 3, 4];
    const y = [5, 5, 5, 5];
    const result = linearRegression(x, y);
    expect(result.slope).toBeCloseTo(0);
  });

  it('handles single point', () => {
    const result = linearRegression([1], [5]);
    expect(result.intercept).toBe(5);
  });
});
