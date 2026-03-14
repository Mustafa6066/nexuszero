import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  extractTraceContextMock: vi.fn(() => ({ traceId: 'trace-123' })),
  withSpanMock: vi.fn(async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()),
  spanKindForMessagingConsumerMock: vi.fn(() => 'consumer'),
}));

const stepMocks = vi.hoisted(() => ({
  oauthExecuteMock: vi.fn(async () => ({ connectedProviders: ['google_ads'] })),
  auditExecuteMock: vi.fn(async () => ({ auditScore: 88 })),
  provisionExecuteMock: vi.fn(async () => ({ provisioned: true })),
  strategyExecuteMock: vi.fn(async () => ({ plan: 'mena-growth' })),
  goLiveExecuteMock: vi.fn(async () => ({ activated: true })),
}));

const stateMachineMocks = vi.hoisted(() => ({
  onStepCompleteMock: vi.fn(async () => undefined),
  onStepFailedMock: vi.fn(async () => undefined),
}));

vi.mock('bullmq', () => ({
  Worker: class {},
}));

vi.mock('@nexuszero/shared', () => ({
  extractTraceContext: sharedMocks.extractTraceContextMock,
  withSpan: sharedMocks.withSpanMock,
  spanKindForMessagingConsumer: sharedMocks.spanKindForMessagingConsumerMock,
  QUEUE_NAMES: { ONBOARDING: 'onboarding' },
}));

vi.mock('@nexuszero/queue', () => ({
  getRedisConnection: vi.fn(() => ({})),
}));

vi.mock('./state-machine.js', () => ({
  OnboardingStateMachine: class {
    onStepComplete = stateMachineMocks.onStepCompleteMock;
    onStepFailed = stateMachineMocks.onStepFailedMock;
  },
}));

vi.mock('./steps/oauth-connect.js', () => ({
  OAuthConnectStep: class {
    execute = stepMocks.oauthExecuteMock;
  },
}));

vi.mock('./steps/instant-audit.js', () => ({
  InstantAuditStep: class {
    execute = stepMocks.auditExecuteMock;
  },
}));

vi.mock('./steps/provision.js', () => ({
  ProvisionStep: class {
    execute = stepMocks.provisionExecuteMock;
  },
}));

vi.mock('./steps/strategy-generate.js', () => ({
  StrategyGenerateStep: class {
    execute = stepMocks.strategyExecuteMock;
  },
}));

vi.mock('./steps/go-live.js', () => ({
  GoLiveStep: class {
    execute = stepMocks.goLiveExecuteMock;
  },
}));

describe('OnboardingWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedMocks.extractTraceContextMock.mockReturnValue({ traceId: 'trace-123' });
    sharedMocks.withSpanMock.mockImplementation(async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback());
    stepMocks.oauthExecuteMock.mockResolvedValue({ connectedProviders: ['google_ads'] });
    stepMocks.auditExecuteMock.mockResolvedValue({ auditScore: 88 });
  });

  it('wraps onboarding steps in a consumer span using the propagated trace context', async () => {
    const { OnboardingWorker } = await import('./worker.js');
    const worker = new OnboardingWorker();

    await (worker as any).processStep({
      data: {
        tenantId: 'tenant-1',
        step: 'oauth_connect',
        config: { platform: 'google_ads' },
        traceContext: { traceparent: '00-abc-123-01' },
      },
    });

    expect(sharedMocks.extractTraceContextMock).toHaveBeenCalledWith({ traceparent: '00-abc-123-01' });
    expect(sharedMocks.withSpanMock).toHaveBeenCalledWith(
      'onboarding.step.process',
      expect.objectContaining({
        tracerName: 'nexuszero.onboarding-service',
        kind: 'consumer',
        parentContext: { traceId: 'trace-123' },
        attributes: expect.objectContaining({
          'messaging.system': 'bullmq',
          'messaging.destination.name': 'onboarding',
          'nexuszero.tenant.id': 'tenant-1',
          'nexuszero.onboarding.step': 'oauth_connect',
        }),
      }),
      expect.any(Function),
    );
    expect(stepMocks.oauthExecuteMock).toHaveBeenCalledWith('tenant-1', { platform: 'google_ads' });
    expect(stateMachineMocks.onStepCompleteMock).toHaveBeenCalledWith('oauth_connect', { connectedProviders: ['google_ads'] });
    expect(stateMachineMocks.onStepFailedMock).not.toHaveBeenCalled();
  });

  it('marks the onboarding step as failed when execution throws', async () => {
    const { OnboardingWorker } = await import('./worker.js');
    const worker = new OnboardingWorker();
    stepMocks.auditExecuteMock.mockRejectedValueOnce(new Error('audit provider unavailable'));

    await expect((worker as any).processStep({
      data: {
        tenantId: 'tenant-2',
        step: 'instant_audit',
        config: { website: 'https://acme.example' },
        traceContext: { traceparent: '00-def-456-01' },
      },
    })).rejects.toThrow('audit provider unavailable');

    expect(stateMachineMocks.onStepFailedMock).toHaveBeenCalledWith('instant_audit', 'audit provider unavailable');
  });
});