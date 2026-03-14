import { beforeEach, describe, expect, it, vi } from 'vitest';

const { publishAgentTaskMock, selectMock, updateWhereMock, updateSetMock, updateMock, fakeDb } = vi.hoisted(() => {
  const selectMock = vi.fn();
  const updateWhereMock = vi.fn(async () => undefined);
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  return {
    publishAgentTaskMock: vi.fn(async () => 'task-1'),
    selectMock,
    updateWhereMock,
    updateSetMock,
    updateMock,
    fakeDb: {
      select: selectMock,
      update: updateMock,
    },
  };
});

vi.mock('@nexuszero/queue', () => ({
  publishAgentTask: publishAgentTaskMock,
}));

vi.mock('@nexuszero/db', () => ({
  withTenantDb: async (_tenantId: string, callback: (db: typeof fakeDb) => Promise<unknown>) => callback(fakeDb),
  getDb: () => fakeDb,
  agentTasks: {
    id: 'id',
    tenantId: 'tenantId',
    status: 'status',
    attempts: 'attempts',
    maxAttempts: 'maxAttempts',
    type: 'type',
    priority: 'priority',
    input: 'input',
  },
  tenants: {
    plan: 'plan',
    id: 'id',
  },
}));

import { TaskRouter } from './task-router';

describe('TaskRouter.onTaskFailed', () => {
  beforeEach(() => {
    publishAgentTaskMock.mockClear();
    selectMock.mockReset();
    updateWhereMock.mockClear();
    updateSetMock.mockClear();
    updateMock.mockClear();

    selectMock.mockImplementation((selection?: Record<string, unknown>) => {
      if (selection?.count) {
        return {
          from: () => ({
            where: async () => ([{ count: 0 }]),
          }),
        };
      }

      if (selection?.plan) {
        return {
          from: () => ({
            where: () => ({
              limit: async () => ([{ plan: 'growth' }]),
            }),
          }),
        };
      }

      if (selection?.id && selection?.type && selection?.priority && selection?.input) {
        return {
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => ([]),
              }),
            }),
          }),
        };
      }

      return {
        from: () => ({
          where: () => ({
            limit: async () => ([{
              id: 'task-1',
              type: 'keyword_research',
              attempts: 1,
              maxAttempts: 3,
              priority: 'high',
              input: { domain: 'example.com' },
            }]),
          }),
        }),
      };
    });
  });

  it('requeues failed tasks with exponential backoff', async () => {
    const router = new TaskRouter();

    await router.onTaskFailed({
      taskId: 'task-1',
      tenantId: 'tenant-a',
      error: 'Anthropic outage',
      type: 'keyword_research',
    });

    expect(publishAgentTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1',
      tenantId: 'tenant-a',
      type: 'keyword_research',
      delay: 2_000,
    }));
  });
});