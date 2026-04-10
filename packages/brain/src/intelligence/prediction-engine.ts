import { getRedisConnection } from '@nexuszero/queue';
import type { PredictionResult } from '../types.js';

// ---------------------------------------------------------------------------
// Prediction Engine — Layer 5
//
// Pattern matching and outcome forecasting based on historical task data.
// Predicts which KPIs will move and recommends interventions.
// ---------------------------------------------------------------------------

const CACHE_KEY = (tenantId: string) => `brain:intelligence:predictions:${tenantId}`;
const CACHE_TTL = 3_600; // 1 hour

export interface PatternMatch {
  pattern: string;
  confidence: number;
  occurrences: number;
  suggestedAction: string;
}

export class PredictionEngine {
  /** Generate predictions for a tenant based on historical patterns */
  async predict(
    tenantId: string,
    recentMetrics: Record<string, number>,
    historicalTrends: Array<{ metric: string; values: number[] }>,
  ): Promise<PredictionResult[]> {
    const redis = getRedisConnection();
    const cached = await redis.get(CACHE_KEY(tenantId));
    if (cached) {
      try {
        return JSON.parse(cached) as PredictionResult[];
      } catch {
        // Rebuild
      }
    }

    const predictions: PredictionResult[] = [];

    for (const trend of historicalTrends) {
      const prediction = this.forecastMetric(trend.metric, trend.values, recentMetrics[trend.metric]);
      if (prediction) {
        predictions.push(prediction);
      }
    }

    if (predictions.length > 0) {
      await redis.setex(CACHE_KEY(tenantId), CACHE_TTL, JSON.stringify(predictions));
    }

    return predictions;
  }

  /** Match known failure patterns and recommend preemptive actions */
  async matchPatterns(
    tenantId: string,
    taskType: string,
    context: Record<string, unknown>,
  ): Promise<PatternMatch[]> {
    const redis = getRedisConnection();
    const patternsKey = `brain:patterns:${tenantId}:${taskType}`;
    const raw = await redis.get(patternsKey);

    if (!raw) return [];

    try {
      return JSON.parse(raw) as PatternMatch[];
    } catch {
      return [];
    }
  }

  /** Record an outcome pattern for future matching */
  async recordPattern(
    tenantId: string,
    taskType: string,
    pattern: PatternMatch,
  ): Promise<void> {
    const redis = getRedisConnection();
    const patternsKey = `brain:patterns:${tenantId}:${taskType}`;
    const existing = await redis.get(patternsKey);

    let patterns: PatternMatch[] = [];
    if (existing) {
      try {
        patterns = JSON.parse(existing) as PatternMatch[];
      } catch {
        patterns = [];
      }
    }

    // Update existing pattern or add new
    const idx = patterns.findIndex(p => p.pattern === pattern.pattern);
    if (idx >= 0) {
      patterns[idx] = {
        ...patterns[idx]!,
        occurrences: (patterns[idx]!.occurrences || 0) + 1,
        confidence: Math.min(1, (patterns[idx]!.confidence + pattern.confidence) / 2),
      };
    } else {
      patterns.push(pattern);
    }

    // Keep at most 50 patterns per task type
    if (patterns.length > 50) {
      patterns.sort((a, b) => b.confidence * b.occurrences - a.confidence * a.occurrences);
      patterns = patterns.slice(0, 50);
    }

    await redis.setex(patternsKey, 30 * 24 * 3_600, JSON.stringify(patterns)); // 30 day TTL
  }

  /**
   * Simple linear trend forecasting.
   * For production, this would integrate with the data-nexus forecast handler.
   */
  private forecastMetric(
    metric: string,
    historicalValues: number[],
    currentValue?: number,
  ): PredictionResult | null {
    if (historicalValues.length < 3) return null;

    // Compute slope from recent values
    const recent = historicalValues.slice(-7);
    const n = recent.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = recent.reduce((a, b) => a + b, 0);
    const sumXY = recent.reduce((sum, y, i) => sum + i * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict next value
    const predicted = intercept + slope * n;
    const current = currentValue ?? recent[recent.length - 1] ?? 0;

    // Confidence based on variance
    const variance = recent.reduce((sum, val) => {
      const expected = intercept + slope * recent.indexOf(val);
      return sum + (val - expected) ** 2;
    }, 0) / n;

    const confidence = Math.max(0.1, Math.min(0.95, 1 - Math.sqrt(variance) / (Math.abs(current) || 1)));

    // Only report meaningful predictions
    const changePercent = current !== 0 ? Math.abs(predicted - current) / Math.abs(current) : 0;
    if (changePercent < 0.05) return null; // Less than 5% change — not interesting

    const direction = predicted > current ? 'increase' : 'decrease';
    const suggestion = this.suggestIntervention(metric, direction, changePercent);

    return {
      metric,
      currentValue: current,
      predictedValue: predicted,
      confidence,
      timeHorizon: '7d',
      suggestedIntervention: suggestion,
    };
  }

  private suggestIntervention(metric: string, direction: string, changePercent: number): string | undefined {
    if (changePercent < 0.1) return undefined;

    const interventions: Record<string, Record<string, string>> = {
      cpa: {
        increase: 'Review bid strategy and audience targeting to prevent CPA increase',
        decrease: 'CPA improving — consider scaling budget on winning campaigns',
      },
      roas: {
        increase: 'ROAS trending up — evaluate budget reallocation to best performers',
        decrease: 'ROAS declining — audit campaign performance and creative fatigue',
      },
      ctr: {
        increase: 'CTR improving — test scaling to broader audiences',
        decrease: 'CTR declining — refresh creatives and review targeting',
      },
    };

    return interventions[metric]?.[direction];
  }
}
