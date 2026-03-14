import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumeFromKafkaMock: vi.fn(),
  initializeOpenTelemetryMock: vi.fn(async () => undefined),
  extractTraceContextMock: vi.fn(() => ({ traceId: 'trace-1' })),
  withSpanMock: vi.fn(async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()),
  spanKindForMessagingConsumerMock: vi.fn(() => 'consumer'),
  dispatchEventMock: vi.fn(async () => undefined),
  workerStartMock: vi.fn(),
  workerStopMock: vi.fn(async () => undefined),
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
  KAFKA_TOPICS: { EVENTS_WEBHOOK: 'events.webhook' },
  spanKindForMessagingConsumer: mocks.spanKindForMessagingConsumerMock,
  withSpan: mocks.withSpanMock,
}));

vi.mock('../src/worker.js', () => ({
  WebhookWorker: class {
    start = mocks.workerStartMock;
    stop = mocks.workerStopMock;
  },
}));
vi.mock('../src/dispatcher.js', () => ({
  WebhookDispatcher: class {
    dispatchEvent = mocks.dispatchEventMock;
  },
}));

vi.mock('@hono/node-server', () => ({
  serve: mocks.serveMock,
}));

describe('webhook-service consumer tracing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.WEBHOOK_SERVICE_INSTANCE_ID = 'webhook-test';
    mocks.initializeOpenTelemetryMock.mockResolvedValue(undefined);
    mocks.consumeFromKafkaMock.mockResolvedValue([
      {
        key: 'tenant-1',
        offset: '42',
        traceContext: { traceparent: '00-abc-123-01' },
        value: {
          tenantId: 'tenant-1',
          type: 'campaign.updated',
          data: { status: 'active' },
        },
      },
    ]);
  });

  it('wraps consumed webhook events in traced spans and dispatches them', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = mocks.setTimeoutMock as typeof setTimeout;
    globalThis.clearTimeout = mocks.clearTimeoutMock as typeof clearTimeout;
    let resolveDispatch: (() => void) | null = null;
    const dispatched = new Promise<void>((resolve) => {
      resolveDispatch = resolve;
    });
    mocks.dispatchEventMock.mockImplementationOnce(async () => {
      resolveDispatch?.();
    });

    try {
      const { startEventConsumer } = await import('../src/index.js');
      const stop = startEventConsumer();

      await dispatched;

      expect(mocks.consumeFromKafkaMock).toHaveBeenCalledWith('events.webhook', 'webhook-service', 'webhook-test');
      expect(mocks.extractTraceContextMock).toHaveBeenCalledWith({ traceparent: '00-abc-123-01' });
      expect(mocks.withSpanMock).toHaveBeenCalledWith(
        'kafka.consume.webhook_event',
        expect.objectContaining({
          tracerName: 'nexuszero.webhook-service',
          kind: 'consumer',
          parentContext: { traceId: 'trace-1' },
          attributes: expect.objectContaining({
            'messaging.system': 'kafka',
            'messaging.destination.name': 'events.webhook',
            'messaging.kafka.offset': '42',
            'nexuszero.tenant.id': 'tenant-1',
          }),
        }),
        expect.any(Function),
      );
      stop();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('exits with code 1 when startup initialization fails', async () => {
    mocks.initializeOpenTelemetryMock.mockRejectedValueOnce(new Error('otel unavailable'));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { run } = await import('../src/index.js');
      await run();

      expect(errorSpy).toHaveBeenCalledWith('Webhook service failed to start:', expect.any(Error));
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mocks.workerStartMock).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});