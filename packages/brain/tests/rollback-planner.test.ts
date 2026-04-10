import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamicTaskPlan } from '../src/types.ts';

const mocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  const redis = {
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };

  return { store, redis };
});

vi.mock('@nexuszero/queue', () => ({
  getRedisConnection: () => mocks.redis,
}));

describe('RollbackPlanner', () => {
  beforeEach(() => {
    mocks.store.clear();
    vi.clearAllMocks();
  });

  it('stores and retrieves rollback steps for a plan', async () => {
    const { RollbackPlanner } = await import('../src/planning/rollback-planner.ts');
    const planner = new RollbackPlanner();
    const plan = createPlan();

    await planner.storeRollbackPlan(plan);
    const steps = await planner.getRollbackPlan(plan.id);

    expect(steps).toEqual(plan.rollbackPlan);
    expect(mocks.redis.setex).toHaveBeenCalledTimes(1);
  });

  it('executes rollback in reverse order up to the failed task and marks the plan as rolled back', async () => {
    const { RollbackPlanner } = await import('../src/planning/rollback-planner.ts');
    const planner = new RollbackPlanner();
    const plan = createPlan();

    await planner.storeRollbackPlan(plan);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const executed = await planner.executeRollback(plan.id, 'task-2');

      expect(executed.map((step) => step.taskId)).toEqual(['task-2', 'task-1']);

      const storedValue = mocks.store.get(`brain:rollback:${plan.id}`);
      expect(storedValue).toBeTruthy();
      expect(JSON.parse(storedValue!)).toMatchObject({
        planId: plan.id,
        rolledBackAt: expect.any(String),
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

function createPlan(): DynamicTaskPlan {
  return {
    id: 'plan-1',
    tenantId: 'tenant-1',
    tasks: [],
    reasoning: 'test plan',
    estimatedTotalDurationMs: 10_000,
    rollbackPlan: [
      { taskId: 'task-1', action: 'cancel', description: 'Rollback first task' },
      { taskId: 'task-2', action: 'pause_campaign', description: 'Rollback second task' },
      { taskId: 'task-3', action: 'disconnect', description: 'Rollback third task' },
    ],
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}