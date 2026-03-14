import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumeFromKafkaMock: vi.fn(),
  initializeOpenTelemetryMock: vi.fn(async () => undefined),
  extractTraceContextMock: vi.fn(() => ({ traceId: 'trace-orch' })),
  withSpanMock: vi.fn(async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()),
  spanKindForMessagingConsumerMock: vi.fn(() => 'consumer'),
  taskCompletedMock: vi.fn(async () => undefined),
  taskFailedMock: vi.fn(async () => undefined),
  agentSignalMock: vi.fn(async () => undefined),
  schedulerStartMock: vi.fn(),
  schedulerStopMock: vi.fn(),
  healthStartMock: vi.fn(),
  healthStopMock: vi.fn(),
  getAllAgentStatusMock: vi.fn(async () => []),
  serveMock: vi.fn(),
  setTimeoutMock: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
  clearTimeoutMock: vi.fn(),
}));

vi.mock('@nexuszero/queue', () => ({
  consumeFromKafka: mocks.consumeFromKafkaMock,
}));

vi.mock('@nexuszero/shared', () => ({
  extractTraceContext: mocks.extractTraceContextMock,
  initializeOpenTelemetry: mocks.initializeOpenTelemetryMock,
  spanKindForMessagingConsumer: mocks.spanKindForMessagingConsumerMock,
  withSpan: mocks.withSpanMock,
}));

vi.mock('../src/task-router.js', () => ({
  TaskRouter: class {
    onTaskFailed = mocks.taskFailedMock;
    onAgentSignal = mocks.agentSignalMock;
  },
}));

vi.mock('../src/task-graph.js', () => ({
  TaskGraphExecutor: class {
    onTaskCompleted = mocks.taskCompletedMock;
  },
}));

vi.mock('../src/scheduler.js', () => ({
  Scheduler: class {
    start = mocks.schedulerStartMock;
    stop = mocks.schedulerStopMock;
  },
}));

vi.mock('../src/health-monitor.js', () => ({
  HealthMonitor: class {
    start = mocks.healthStartMock;
    stop = mocks.healthStopMock;
    getAllAgentStatus = mocks.getAllAgentStatusMock;
  },
}));

vi.mock('@hono/node-server', () => ({
  serve: mocks.serveMock,
}));

describe('orchestrator consumer tracing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ORCHESTRATOR_INSTANCE_ID = 'orchestrator-test';
    process.env.KAFKA_POLL_INTERVAL_MS = '50';
    mocks.initializeOpenTelemetryMock.mockResolvedValue(undefined);
    mocks.consumeFromKafkaMock.mockImplementation(async (topic: string) => {
      if (topic === 'agent-tasks-completed') {
        return [{
          key: 'tenant-7',
          offset: '17',
          traceContext: { traceparent: '00-complete-123-01' },
          value: { tenantId: 'tenant-7', taskId: 'task-1', output: { score: 92 } },
        }];
      }

      return [];
    });
  });

  it('wraps completed-task messages in tracing spans before routing them', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = mocks.setTimeoutMock as typeof setTimeout;
    globalThis.clearTimeout = mocks.clearTimeoutMock as typeof clearTimeout;
    let resolveCompletion: (() => void) | null = null;
    const completed = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    mocks.taskCompletedMock.mockImplementationOnce(async () => {
      resolveCompletion?.();
    });

    try {
      const { startConsumers } = await import('../src/index.js');
      const stop = startConsumers();

      await completed;

      expect(mocks.consumeFromKafkaMock).toHaveBeenCalledWith('agent-tasks-completed', 'orchestrator-tasks', 'orchestrator-test');
      expect(mocks.extractTraceContextMock).toHaveBeenCalledWith({ traceparent: '00-complete-123-01' });
      expect(mocks.withSpanMock).toHaveBeenCalledWith(
        'kafka.consume.task_completion',
        expect.objectContaining({
          tracerName: 'nexuszero.orchestrator',
          kind: 'consumer',
          parentContext: { traceId: 'trace-orch' },
          attributes: expect.objectContaining({
            'messaging.system': 'kafka',
            'messaging.destination.name': 'agent-tasks-completed',
            'messaging.kafka.offset': '17',
            'nexuszero.tenant.id': 'tenant-7',
          }),
        }),
        expect.any(Function),
      );
      expect(mocks.taskCompletedMock).toHaveBeenCalledWith({ tenantId: 'tenant-7', taskId: 'task-1', output: { score: 92 } });

      stop();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('exits with code 1 when startup initialization fails', async () => {
    mocks.initializeOpenTelemetryMock.mockRejectedValueOnce(new Error('collector unavailable'));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { run } = await import('../src/index.js');
      await run();

      expect(errorSpy).toHaveBeenCalledWith('Orchestrator failed to start:', expect.any(Error));
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mocks.schedulerStartMock).not.toHaveBeenCalled();
      expect(mocks.healthStartMock).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('applies exponential backoff when Kafka polling fails repeatedly', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    let resolveScheduled: (() => void) | null = null;
    const scheduled = new Promise<void>((resolve) => {
      resolveScheduled = resolve;
    });

    globalThis.setTimeout = mocks.setTimeoutMock as typeof setTimeout;
    globalThis.clearTimeout = mocks.clearTimeoutMock as typeof clearTimeout;
    mocks.consumeFromKafkaMock.mockRejectedValue(new Error('kafka unavailable'));
    mocks.setTimeoutMock.mockImplementation((callback: TimerHandler, delay?: number) => {
      if (mocks.setTimeoutMock.mock.calls.length >= 3) {
        resolveScheduled?.();
      }
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { startConsumers } = await import('../src/index.js');
      const stop = startConsumers();

      await scheduled;

      expect(mocks.consumeFromKafkaMock).toHaveBeenNthCalledWith(1, 'agent-tasks-completed', 'orchestrator-tasks', 'orchestrator-test');
      expect(mocks.consumeFromKafkaMock).toHaveBeenNthCalledWith(2, 'agent-tasks-failed', 'orchestrator-failures', 'orchestrator-test');
      expect(mocks.consumeFromKafkaMock).toHaveBeenNthCalledWith(3, 'agent-signals', 'orchestrator-signals', 'orchestrator-test');
      expect(errorSpy).toHaveBeenCalledTimes(3);
      expect(mocks.setTimeoutMock).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
      expect(mocks.setTimeoutMock).toHaveBeenNthCalledWith(2, expect.any(Function), 100);
      expect(mocks.setTimeoutMock).toHaveBeenNthCalledWith(3, expect.any(Function), 100);

      stop();
    } finally {
      errorSpy.mockRestore();
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});