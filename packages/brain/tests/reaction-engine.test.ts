import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactionEvent } from '../src/types.ts';

const mocks = vi.hoisted(() => {
  const redis = {
    get: vi.fn(async () => null),
    rpush: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ltrim: vi.fn(async () => 'OK'),
  };

  return { redis };
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

vi.mock('@nexuszero/llm-router', () => ({
  routedCompletionWithUsage: vi.fn(async () => ({
    content: '{"summary":"ok","rootCause":"unknown","adjustments":{}}',
  })),
}));

describe('ReactionEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.get.mockResolvedValue(null);
  });

  it('derives reactions from the operating picture and keeps manual reactions pending', async () => {
    const { ReactionEngine } = await import('../src/reactions/reaction-engine.ts');

    const diagnoseHandler = { handle: vi.fn(async () => undefined) };
    const redistributeHandler = { handle: vi.fn(async () => undefined) };
    const throttleHandler = { handle: vi.fn(async () => undefined) };
    const escalation = {
      handle: vi.fn(async () => undefined),
      scheduleEscalation: vi.fn(async () => undefined),
    };

    const engine = new ReactionEngine({
      'diagnose-and-retry': diagnoseHandler as never,
      'redistribute-load': redistributeHandler as never,
      'throttle-and-notify': throttleHandler as never,
    }, escalation as never);

    await engine.processReactions(
      'tenant-1',
      {
        recentOutcomes: [{ taskId: 'task-1', taskType: 'seo_audit', agentType: 'seo', status: 'failed' }],
        fleet: { agents: [{ agentType: 'ad', activity: 'degraded', healthScore: 0.31 }] },
        kpiSnapshot: { budgetUsedPercent: 86 },
      },
      {
        strategyEvaluations: [{ strategyId: 'strategy-1', status: 'stale', reason: 'drift detected' }],
      },
    );

    expect(diagnoseHandler.handle).toHaveBeenCalledTimes(1);
    expect(redistributeHandler.handle).toHaveBeenCalledTimes(1);
    expect(throttleHandler.handle).toHaveBeenCalledTimes(1);

    const pending = engine.getPendingReactions('tenant-1');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.trigger).toBe('strategy-stale');
    expect(mocks.redis.rpush).toHaveBeenCalledWith(
      'brain:approvals:tenant-1',
      expect.stringContaining('strategy-stale'),
    );
  });

  it('records failed reactions and schedules escalation when an auto reaction handler throws', async () => {
    const { ReactionEngine } = await import('../src/reactions/reaction-engine.ts');

    const diagnoseHandler = { handle: vi.fn(async () => { throw new Error('retry failed'); }) };
    const escalation = {
      handle: vi.fn(async () => undefined),
      scheduleEscalation: vi.fn(async () => undefined),
    };

    const engine = new ReactionEngine({
      'diagnose-and-retry': diagnoseHandler as never,
    }, escalation as never);

    await engine.react('tenant-1', createReactionEvent());

    expect(diagnoseHandler.handle).toHaveBeenCalledTimes(1);
    expect(escalation.scheduleEscalation).toHaveBeenCalledTimes(1);

    const pending = engine.getPendingReactions('tenant-1');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      trigger: 'task-failed',
      status: 'failed',
      attempts: 1,
    });
  });
});

function createReactionEvent(): ReactionEvent {
  return {
    id: 'reaction-1',
    tenantId: 'tenant-1',
    trigger: 'task-failed',
    context: { taskId: 'task-1' },
    sourceAgentType: 'seo',
    status: 'pending',
    attempts: 0,
    startedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}