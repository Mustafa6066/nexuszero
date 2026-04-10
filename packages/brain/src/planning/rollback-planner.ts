import { getRedisConnection } from '@nexuszero/queue';
import type { DynamicTaskPlan, RollbackStep } from '../types.js';

// ---------------------------------------------------------------------------
// Rollback Planner — Planning Layer
//
// For each generated plan, manages rollback execution if tasks fail.
// Stores rollback state in Redis so it survives process restarts.
// ---------------------------------------------------------------------------

const ROLLBACK_KEY = (planId: string) => `brain:rollback:${planId}`;
const ROLLBACK_TTL = 24 * 60 * 60; // 24h

export class RollbackPlanner {
  /** Store the rollback plan for later execution if needed */
  async storeRollbackPlan(plan: DynamicTaskPlan): Promise<void> {
    if (plan.rollbackPlan.length === 0) return;

    const redis = getRedisConnection();
    await redis.setex(
      ROLLBACK_KEY(plan.id),
      ROLLBACK_TTL,
      JSON.stringify({
        planId: plan.id,
        tenantId: plan.tenantId,
        steps: plan.rollbackPlan,
        createdAt: plan.createdAt.toISOString(),
      }),
    );
  }

  /** Get the rollback plan for a failed plan */
  async getRollbackPlan(planId: string): Promise<RollbackStep[] | null> {
    const redis = getRedisConnection();
    const raw = await redis.get(ROLLBACK_KEY(planId));
    if (!raw) return null;

    try {
      const data = JSON.parse(raw) as { steps: RollbackStep[] };
      return data.steps;
    } catch {
      return null;
    }
  }

  /** Execute rollback for a plan — returns the steps that were processed */
  async executeRollback(planId: string, failedTaskId: string): Promise<RollbackStep[]> {
    const steps = await this.getRollbackPlan(planId);
    if (!steps) return [];

    // Find the failed task's index and rollback from there backwards
    const failedIndex = steps.findIndex(s => s.taskId === failedTaskId);
    if (failedIndex === -1) return [];

    // Rollback all steps up to and including the failed task
    const toRollback = steps.slice(0, failedIndex + 1).reverse();

    console.log(JSON.stringify({
      level: 'info',
      msg: 'Executing rollback plan',
      planId,
      failedTaskId,
      rollbackSteps: toRollback.length,
    }));

    // Mark rollback as executed
    await this.markRollbackExecuted(planId);

    return toRollback;
  }

  /** Clean up rollback plan after successful plan completion */
  async clearRollbackPlan(planId: string): Promise<void> {
    const redis = getRedisConnection();
    await redis.del(ROLLBACK_KEY(planId));
  }

  private async markRollbackExecuted(planId: string): Promise<void> {
    const redis = getRedisConnection();
    const key = ROLLBACK_KEY(planId);
    const raw = await redis.get(key);
    if (!raw) return;

    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      data.rolledBackAt = new Date().toISOString();
      await redis.setex(key, ROLLBACK_TTL, JSON.stringify(data));
    } catch {
      // Ignore
    }
  }
}
