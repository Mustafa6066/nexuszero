import { getRedisConnection } from '@nexuszero/queue';
import type { OperatingPicture, StrategyEvaluation, StrategyDecisionRecord } from '../types.js';

// ---------------------------------------------------------------------------
// Strategy Evaluator — Reasoning Engine
//
// Evaluates if active strategies are healthy, stale, conflicting, or
// underperforming. Inspired by Repowise's Decision Intelligence layer
// with staleness tracking and conflict detection.
// ---------------------------------------------------------------------------

const STALENESS_DRIFT_THRESHOLD = 0.20; // 20% drift triggers staleness
const CONFLICT_OVERLAP_THRESHOLD = 2; // Strategies governing same agents + channels

export class StrategyEvaluator {
  /** Evaluate all active strategies for a tenant */
  async evaluate(tenantId: string, picture: OperatingPicture): Promise<StrategyEvaluation[]> {
    const strategies = picture.activeStrategies;
    if (strategies.length === 0) return [];

    const evaluations: StrategyEvaluation[] = [];

    for (const strategy of strategies) {
      const evaluation = this.evaluateStrategy(strategy, picture);
      evaluations.push(evaluation);
    }

    // Check for conflicts between strategies
    const conflicts = this.detectConflicts(strategies);
    for (const conflict of conflicts) {
      evaluations.push(conflict);
    }

    return evaluations;
  }

  /** Run scheduled decision health check (called daily) */
  async runDecisionHealthCheck(tenantId: string): Promise<void> {
    const redis = getRedisConnection();
    const key = `brain:strategies:${tenantId}`;
    const cached = await redis.get(key);

    if (!cached) return;

    let strategies: StrategyDecisionRecord[];
    try {
      strategies = JSON.parse(cached) as StrategyDecisionRecord[];
    } catch {
      return;
    }

    const now = new Date();
    let updated = false;

    for (const strategy of strategies) {
      if (strategy.status !== 'active') continue;

      // Check staleness based on actual vs expected metrics
      if (strategy.actualMetrics && strategy.expectedMetrics) {
        const driftPercent = this.computeMaxDrift(strategy.expectedMetrics, strategy.actualMetrics);
        if (driftPercent > strategy.stalenessThreshold) {
          strategy.status = 'stale';
          updated = true;
        }
      }

      strategy.lastCheckedAt = now;
    }

    if (updated) {
      await redis.setex(key, 604_800, JSON.stringify(strategies)); // 7d TTL
    }
  }

  /** Detect strategies that are no longer producing outcomes (weekly scan) */
  async detectStaleStrategies(tenantId: string): Promise<void> {
    const redis = getRedisConnection();
    const key = `brain:strategies:${tenantId}`;
    const cached = await redis.get(key);

    if (!cached) return;

    let strategies: StrategyDecisionRecord[];
    try {
      strategies = JSON.parse(cached) as StrategyDecisionRecord[];
    } catch {
      return;
    }

    const now = Date.now();
    const staleDays = 30;
    let updated = false;

    for (const strategy of strategies) {
      if (strategy.status !== 'active') continue;

      const daysSinceChecked = (now - new Date(strategy.lastCheckedAt).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceChecked > staleDays) {
        strategy.status = 'stale';
        updated = true;
      }
    }

    if (updated) {
      await redis.setex(key, 604_800, JSON.stringify(strategies));

      // Publish stale strategy alert for Brain reaction system
      console.log(JSON.stringify({
        level: 'warn',
        msg: 'Stale strategies detected',
        tenantId,
        count: strategies.filter(s => s.status === 'stale').length,
      }));
    }
  }

  private evaluateStrategy(
    strategy: StrategyDecisionRecord,
    picture: OperatingPicture,
  ): StrategyEvaluation {
    // Check if governed agents are healthy
    const governedAgentHealth = strategy.governedAgents
      .map(agentType => picture.fleet.agents.find(a => a.agentType === agentType))
      .filter(Boolean)
      .map(a => a!.healthScore);

    const avgHealth = governedAgentHealth.length > 0
      ? governedAgentHealth.reduce((sum, h) => sum + h, 0) / governedAgentHealth.length
      : 0;

    // Check metric drift
    let driftPercent = 0;
    if (strategy.actualMetrics && strategy.expectedMetrics) {
      driftPercent = this.computeMaxDrift(strategy.expectedMetrics, strategy.actualMetrics);
    }

    // Determine status
    if (driftPercent > STALENESS_DRIFT_THRESHOLD) {
      return {
        strategyId: strategy.id,
        status: 'stale',
        reason: `Metrics drifted ${(driftPercent * 100).toFixed(1)}% from expectations (threshold: ${STALENESS_DRIFT_THRESHOLD * 100}%)`,
        driftPercent,
        suggestedAction: 'Review and update strategy based on current performance data',
      };
    }

    if (avgHealth < 0.5) {
      return {
        strategyId: strategy.id,
        status: 'underperforming',
        reason: `Governed agents avg health is ${avgHealth.toFixed(2)} — agents may not be executing effectively`,
        driftPercent,
        suggestedAction: 'Investigate agent health issues before adjusting strategy',
      };
    }

    return {
      strategyId: strategy.id,
      status: 'healthy',
      reason: 'Strategy is within expected parameters',
      driftPercent,
    };
  }

  private detectConflicts(strategies: StrategyDecisionRecord[]): StrategyEvaluation[] {
    const conflicts: StrategyEvaluation[] = [];

    for (let i = 0; i < strategies.length; i++) {
      for (let j = i + 1; j < strategies.length; j++) {
        const a = strategies[i]!;
        const b = strategies[j]!;

        if (a.status !== 'active' || b.status !== 'active') continue;

        // Check overlap in governed agents and channels
        const agentOverlap = a.governedAgents.filter(ag => b.governedAgents.includes(ag));
        const channelOverlap = a.governedChannels.filter(ch => b.governedChannels.includes(ch));

        if (agentOverlap.length + channelOverlap.length >= CONFLICT_OVERLAP_THRESHOLD) {
          conflicts.push({
            strategyId: a.id,
            status: 'conflicting',
            reason: `Conflicts with strategy "${b.title}" — shared agents: [${agentOverlap.join(', ')}], shared channels: [${channelOverlap.join(', ')}]`,
            driftPercent: 0,
            suggestedAction: `Review strategies "${a.title}" and "${b.title}" for contradictory actions`,
          });
        }
      }
    }

    return conflicts;
  }

  private computeMaxDrift(
    expected: Record<string, number>,
    actual: Record<string, number>,
  ): number {
    let maxDrift = 0;

    for (const [metric, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[metric];
      if (actualValue === undefined || expectedValue === 0) continue;

      const drift = Math.abs(actualValue - expectedValue) / Math.abs(expectedValue);
      maxDrift = Math.max(maxDrift, drift);
    }

    return maxDrift;
  }
}
