import { describe, expect, it, vi } from 'vitest';
import { publishToKafka } from './kafka-client';

describe('publishToKafka', () => {
  it('retries transient producer failures without dropping the message', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('broker unavailable'))
      .mockRejectedValueOnce(new Error('leader election'))
      .mockResolvedValue(undefined);

    const producer = {
      connect: vi.fn(async () => undefined),
      send,
      disconnect: vi.fn(async () => undefined),
    };

    const kafka = {
      producer: () => producer,
      consumer: vi.fn(),
      admin: vi.fn(),
    };

    await publishToKafka('agent-signals', { tenantId: 'tenant-a', type: 'seo_keywords_updated' }, 'tenant-a', {
      kafka: kafka as any,
    });

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][0].messages[0].key).toBe('tenant-a');
  });
});