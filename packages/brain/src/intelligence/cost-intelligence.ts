import { getRedisConnection } from '@nexuszero/queue';
import { getTenantMonthlyUsage } from '@nexuszero/llm-router';
import { getDb, tenants } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import type { CostEfficiency } from '../types.js';

// ---------------------------------------------------------------------------
// Cost Intelligence — Layer 6
//
// Wraps the existing per-tenant cost tracker with cross-agent optimization:
// cost-efficiency scoring, model selection recommendations, and budget
// enforcement at the Brain level.
// ---------------------------------------------------------------------------

const CACHE_KEY = (tenantId: string) => `brain:intelligence:cost:${tenantId}`;
const CACHE_TTL = 1_800; // 30 min
const DEFAULT_MONTHLY_BUDGET_USD = 50;
const PLAN_MONTHLY_BUDGETS: Record<string, number> = {
  launchpad: 50,
  growth: 200,
  enterprise: 1_000,
};

type MonthlyUsage = Awaited<ReturnType<typeof getTenantMonthlyUsage>>;

export interface CostSnapshot {
  tenantId: string;
  monthlySpend: number;
  monthlyBudget: number;
  budgetUsedPercent: number;
  agentEfficiency: CostEfficiency[];
  brainSpend: number;
  brainBudget: number;
  recommendations: string[];
  generatedAt: Date;
}

export class CostIntelligence {
  /** Generate cost analysis for a tenant */
  async analyze(tenantId: string, brainBudgetFraction: number): Promise<CostSnapshot> {
    const redis = getRedisConnection();
    const cached = await redis.get(CACHE_KEY(tenantId));
    if (cached) {
      try {
        return JSON.parse(cached) as CostSnapshot;
      } catch {
        // Rebuild
      }
    }

    const usage = await getTenantMonthlyUsage(tenantId);
    const monthlyBudget = await this.getMonthlyBudget(tenantId);
    const agentEfficiency = this.computeAgentEfficiency(usage);
    const brainBudget = monthlyBudget * brainBudgetFraction;
    const brainSpend = await this.getBrainSpend(tenantId);

    const recommendations = this.generateRecommendations(
      agentEfficiency,
      usage?.totalCostUsd ?? 0,
      monthlyBudget,
      brainSpend,
      brainBudget,
    );

    const snapshot: CostSnapshot = {
      tenantId,
      monthlySpend: usage?.totalCostUsd ?? 0,
      monthlyBudget,
      budgetUsedPercent: monthlyBudget > 0 ? ((usage?.totalCostUsd ?? 0) / monthlyBudget) * 100 : 0,
      agentEfficiency,
      brainSpend,
      brainBudget,
      recommendations,
      generatedAt: new Date(),
    };

    await redis.setex(CACHE_KEY(tenantId), CACHE_TTL, JSON.stringify(snapshot));
    return snapshot;
  }

  /** Check if the brain has budget remaining */
  async hasBrainBudget(tenantId: string, brainBudgetFraction: number): Promise<boolean> {
    const monthlyBudget = await this.getMonthlyBudget(tenantId);
    const brainBudget = monthlyBudget * brainBudgetFraction;
    const brainSpend = await this.getBrainSpend(tenantId);
    return brainSpend < brainBudget;
  }

  /** Record a brain LLM call cost */
  async recordBrainCost(tenantId: string, cost: number): Promise<void> {
    const redis = getRedisConnection();
    const key = `brain:cost:${tenantId}:${this.getCurrentMonth()}`;
    await redis.incrbyfloat(key, cost);
    await redis.expire(key, 35 * 24 * 3_600); // Expire after 35 days
  }

  private async getBrainSpend(tenantId: string): Promise<number> {
    const redis = getRedisConnection();
    const key = `brain:cost:${tenantId}:${this.getCurrentMonth()}`;
    const val = await redis.get(key);
    return val ? parseFloat(val) : 0;
  }

  private computeAgentEfficiency(usage: MonthlyUsage): CostEfficiency[] {
    if (!usage) return [];

    return Object.entries(usage.byAgent)
      .map(([agentType, data]) => {
        const costPerTask = data.requests > 0 ? data.costUsd / data.requests : 0;
        return {
          agentType,
          costPerTask,
          costPerOutcome: costPerTask,
          modelBreakdown: {},
          optimizationSuggestion: data.requests > 0 && costPerTask > 0.50
            ? `${agentType} costs $${costPerTask.toFixed(2)}/task — consider using a faster model for low-complexity tasks`
            : undefined,
        } satisfies CostEfficiency;
      })
      .sort((a, b) => b.costPerTask - a.costPerTask);
  }

  private async getMonthlyBudget(tenantId: string): Promise<number> {
    try {
      const db = getDb();
      const [tenant] = await db.select({ plan: tenants.plan })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      return PLAN_MONTHLY_BUDGETS[tenant?.plan ?? 'launchpad'] ?? DEFAULT_MONTHLY_BUDGET_USD;
    } catch {
      return DEFAULT_MONTHLY_BUDGET_USD;
    }
  }

  private generateRecommendations(
    efficiency: CostEfficiency[],
    totalSpend: number,
    budget: number,
    brainSpend: number,
    brainBudget: number,
  ): string[] {
    const recommendations: string[] = [];

    // Budget warnings
    const usedPercent = (totalSpend / budget) * 100;
    if (usedPercent > 90) {
      recommendations.push(`Budget at ${usedPercent.toFixed(0)}% — consider throttling low-priority tasks`);
    } else if (usedPercent > 75) {
      recommendations.push(`Budget at ${usedPercent.toFixed(0)}% — monitor spending trajectory`);
    }

    // Brain budget
    if (brainBudget > 0 && brainSpend / brainBudget > 0.8) {
      recommendations.push(`Brain reasoning budget at ${((brainSpend / brainBudget) * 100).toFixed(0)}% — reduce tick frequency or use lighter models`);
    }

    // Expensive agents
    const expensive = efficiency.filter(e => e.costPerTask > 0.50);
    for (const agent of expensive.slice(0, 3)) {
      recommendations.push(`${agent.agentType}: $${agent.costPerTask.toFixed(2)}/task — evaluate model tier`);
    }

    return recommendations;
  }

  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
