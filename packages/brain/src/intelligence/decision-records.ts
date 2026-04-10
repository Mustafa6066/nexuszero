import { randomUUID } from 'node:crypto';
import { getRedisConnection } from '@nexuszero/queue';
import type { StrategyDecisionRecord } from '../types.js';

// ---------------------------------------------------------------------------
// Decision Records Intelligence — Layer 4
//
// Records why strategies were chosen, what outcomes were expected, and tracks
// drift between expected and actual metrics. Inspired by Repowise's Decision
// Intelligence with staleness tracking and conflict detection.
// ---------------------------------------------------------------------------

const STRATEGIES_KEY = (tenantId: string) => `brain:strategies:${tenantId}`;
const STRATEGIES_TTL = 604_800; // 7 days

export class DecisionRecords {
  /** Record a new strategy decision */
  async recordDecision(
    tenantId: string,
    decision: Omit<StrategyDecisionRecord, 'id' | 'tenantId' | 'status' | 'createdAt' | 'lastCheckedAt'>,
  ): Promise<StrategyDecisionRecord> {
    const record: StrategyDecisionRecord = {
      id: randomUUID(),
      tenantId,
      ...decision,
      status: 'active',
      createdAt: new Date(),
      lastCheckedAt: new Date(),
    };

    const strategies = await this.getStrategies(tenantId);
    strategies.push(record);
    await this.saveStrategies(tenantId, strategies);

    return record;
  }

  /** Update actual metrics for a strategy (called when outcomes are observed) */
  async updateActualMetrics(
    tenantId: string,
    strategyId: string,
    metrics: Record<string, number>,
  ): Promise<void> {
    const strategies = await this.getStrategies(tenantId);
    const strategy = strategies.find(s => s.id === strategyId);
    if (!strategy) return;

    strategy.actualMetrics = { ...(strategy.actualMetrics ?? {}), ...metrics };
    strategy.lastCheckedAt = new Date();

    // Check staleness immediately on metric update
    if (strategy.expectedMetrics) {
      const maxDrift = this.computeMaxDrift(strategy.expectedMetrics, strategy.actualMetrics);
      if (maxDrift > strategy.stalenessThreshold) {
        strategy.status = 'stale';
      }
    }

    await this.saveStrategies(tenantId, strategies);
  }

  /** Supersede an old strategy with a new one */
  async supersedeStrategy(
    tenantId: string,
    oldStrategyId: string,
    newDecision: Omit<StrategyDecisionRecord, 'id' | 'tenantId' | 'status' | 'createdAt' | 'lastCheckedAt'>,
  ): Promise<StrategyDecisionRecord> {
    const strategies = await this.getStrategies(tenantId);
    const oldStrategy = strategies.find(s => s.id === oldStrategyId);
    if (oldStrategy) {
      oldStrategy.status = 'superseded';
    }

    const newRecord: StrategyDecisionRecord = {
      id: randomUUID(),
      tenantId,
      ...newDecision,
      status: 'active',
      createdAt: new Date(),
      lastCheckedAt: new Date(),
    };

    if (oldStrategy) {
      oldStrategy.supersededBy = newRecord.id;
    }

    strategies.push(newRecord);
    await this.saveStrategies(tenantId, strategies);

    return newRecord;
  }

  /** Archive a strategy */
  async archiveStrategy(tenantId: string, strategyId: string): Promise<void> {
    const strategies = await this.getStrategies(tenantId);
    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.status = 'archived';
      await this.saveStrategies(tenantId, strategies);
    }
  }

  /** Get all strategies for a tenant */
  async getStrategies(tenantId: string): Promise<StrategyDecisionRecord[]> {
    const redis = getRedisConnection();
    const raw = await redis.get(STRATEGIES_KEY(tenantId));
    if (!raw) return [];

    try {
      return JSON.parse(raw) as StrategyDecisionRecord[];
    } catch {
      return [];
    }
  }

  /** Get only active strategies */
  async getActiveStrategies(tenantId: string): Promise<StrategyDecisionRecord[]> {
    const strategies = await this.getStrategies(tenantId);
    return strategies.filter(s => s.status === 'active');
  }

  /** Get stale strategies that need review */
  async getStaleStrategies(tenantId: string): Promise<StrategyDecisionRecord[]> {
    const strategies = await this.getStrategies(tenantId);
    return strategies.filter(s => s.status === 'stale');
  }

  private async saveStrategies(tenantId: string, strategies: StrategyDecisionRecord[]): Promise<void> {
    const redis = getRedisConnection();
    await redis.setex(STRATEGIES_KEY(tenantId), STRATEGIES_TTL, JSON.stringify(strategies));
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
