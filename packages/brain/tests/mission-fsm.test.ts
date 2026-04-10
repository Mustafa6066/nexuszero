import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamicTaskPlan } from '../src/types.ts';

const mocks = vi.hoisted(() => {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const redis = {
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      kv.set(key, value);
    }),
    get: vi.fn(async (key: string) => kv.get(key) ?? null),
    sadd: vi.fn(async (key: string, value: string) => {
      const current = sets.get(key) ?? new Set<string>();
      current.add(value);
      sets.set(key, current);
      return 1;
    }),
    smembers: vi.fn(async (key: string) => [...(sets.get(key) ?? new Set<string>())]),
    expire: vi.fn(async () => 1),
  };

  return { kv, sets, redis };
});

vi.mock('@nexuszero/queue', () => ({
  getRedisConnection: () => mocks.redis,
}));

vi.mock('@nexuszero/shared', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    withContext: (_ctx: unknown, fn: () => unknown) => fn(),
  }),
}));

describe('MissionFSM', () => {
  beforeEach(() => {
    mocks.kv.clear();
    mocks.sets.clear();
    vi.clearAllMocks();
  });

  it('creates and indexes a mission with agent assignments', async () => {
    const { MissionFSM } = await import('../src/missions/mission-fsm.ts');
    const fsm = new MissionFSM();

    const mission = await fsm.createMission('tenant-1', 'Improve acquisition flow', createPlan());
    const activeMissions = await fsm.getActiveMissions('tenant-1');

    expect(mission.status).toBe('planning');
    expect(mission.agentAssignments).toEqual({
      seo: ['task-1'],
      'content-writer': ['task-2'],
    });
    expect(activeMissions.map((item) => item.id)).toContain(mission.id);
  });

  it('moves an executing mission into review when all planned tasks complete successfully', async () => {
    const { MissionFSM } = await import('../src/missions/mission-fsm.ts');
    const fsm = new MissionFSM();

    const mission = await fsm.createMission('tenant-1', 'Close the loop', createSingleTaskPlan());
    await fsm.transition('tenant-1', mission.id, 'dispatching');
    await fsm.transition('tenant-1', mission.id, 'executing');
    await fsm.recordOutcome('tenant-1', mission.id, {
      taskId: 'task-1',
      taskType: 'seo_audit',
      agentType: 'seo',
      status: 'completed',
      durationMs: 4_000,
      cost: 0.12,
      result: { issuesFound: 4 },
    });

    const updatedMission = await fsm.getMission('tenant-1', mission.id);

    expect(updatedMission?.status).toBe('reviewing');
    expect(updatedMission?.totalCost).toBe(0.12);
    expect(updatedMission?.outcomes).toHaveLength(1);
  });

  it('rejects invalid state transitions', async () => {
    const { MissionFSM } = await import('../src/missions/mission-fsm.ts');
    const fsm = new MissionFSM();
    const mission = await fsm.createMission('tenant-1', 'Guard transitions', createSingleTaskPlan());

    await expect(fsm.transition('tenant-1', mission.id, 'completed')).rejects.toThrow(
      'Invalid transition: planning → completed',
    );
  });
});

function createPlan(): DynamicTaskPlan {
  return {
    id: 'plan-1',
    tenantId: 'tenant-1',
    tasks: [
      {
        id: 'task-1',
        taskType: 'seo_audit',
        agentType: 'seo',
        priority: 'high',
        input: {},
        dependsOn: [],
      },
      {
        id: 'task-2',
        taskType: 'write_blog_post',
        agentType: 'content-writer',
        priority: 'medium',
        input: {},
        dependsOn: ['task-1'],
      },
    ],
    reasoning: 'mission test plan',
    estimatedTotalDurationMs: 90_000,
    rollbackPlan: [],
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}

function createSingleTaskPlan(): DynamicTaskPlan {
  return {
    ...createPlan(),
    id: 'plan-2',
    tasks: [
      {
        id: 'task-1',
        taskType: 'seo_audit',
        agentType: 'seo',
        priority: 'high',
        input: {},
        dependsOn: [],
      },
    ],
  };
}