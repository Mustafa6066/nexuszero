import { describe, expect, it, vi } from 'vitest';

const { publishToKafkaMock, queueAddMock, queueCloseMock } = vi.hoisted(() => ({
  publishToKafkaMock: vi.fn(async () => undefined),
  queueAddMock: vi.fn(async () => undefined),
  queueCloseMock: vi.fn(async () => undefined),
}));

vi.mock('./kafka-client.js', () => ({
  publishToKafka: publishToKafkaMock,
}));

vi.mock('./bullmq-client.js', () => ({
  createQueue: () => ({ add: queueAddMock, close: queueCloseMock }),
}));

import { publishAgentSignal, publishOnboardingStep } from './producers';

describe('publishAgentSignal', () => {
  it('preserves tenant-scoped routing for each signal', async () => {
    await publishAgentSignal({ tenantId: 'tenant-a', agentId: 'seo', type: 'seo_keywords_updated', data: { keyword: 'محامي في القاهرة' } });
    await publishAgentSignal({ tenantId: 'tenant-b', agentId: 'seo', type: 'seo_keywords_updated', data: { keyword: 'dentist in dubai' } });

    expect(publishToKafkaMock).toHaveBeenNthCalledWith(
      1,
      'agents.signals',
      expect.objectContaining({ tenantId: 'tenant-a' }),
      'tenant-a',
      expect.any(Object),
    );
    expect(publishToKafkaMock).toHaveBeenNthCalledWith(
      2,
      'agents.signals',
      expect.objectContaining({ tenantId: 'tenant-b' }),
      'tenant-b',
      expect.any(Object),
    );
  });
});

describe('publishOnboardingStep', () => {
  it('injects trace context into onboarding jobs before enqueueing them', async () => {
    await publishOnboardingStep({
      tenantId: 'tenant-a',
      step: 'oauth_connect',
      config: { platform: 'google_ads' },
    });

    expect(queueAddMock).toHaveBeenCalledWith(
      'oauth_connect',
      expect.objectContaining({
        tenantId: 'tenant-a',
        traceContext: expect.any(Object),
      }),
      expect.objectContaining({ priority: 1 }),
    );
  });
});