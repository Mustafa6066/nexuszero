import { getRedisConnection } from '@nexuszero/queue';
import type { TypedSignal, SignalType } from '@nexuszero/queue';
import { safeValidateSignalPayload } from '@nexuszero/queue';
import type { SignalSnapshot } from '../types.js';

// ---------------------------------------------------------------------------
// Signal Aggregator — Perception Layer
//
// Collects pending inter-agent signals from Redis (buffered from Kafka) into
// a unified SignalSnapshot for the Brain's reasoning loop.
// ---------------------------------------------------------------------------

const SIGNAL_BUFFER_KEY = (tenantId: string) => `brain:signals:${tenantId}`;
const MAX_SIGNALS_PER_TICK = 200;

export class SignalAggregator {
  /**
   * Collect signals for a tenant from the signal buffer.
   * If incomingSignals are provided (from Kafka consumer), they are used directly.
   * Otherwise, buffered signals from Redis are consumed and cleared.
   */
  async collect(
    tenantId: string,
    windowMs: number,
    incomingSignals?: unknown[],
  ): Promise<SignalSnapshot> {
    let signals: TypedSignal[];

    if (incomingSignals && incomingSignals.length > 0) {
      signals = this.parseSignals(incomingSignals);
    } else {
      signals = await this.drainSignalBuffer(tenantId);
    }

    return {
      tenantId,
      signals,
      collectedAt: new Date(),
      windowMs,
    };
  }

  /** Buffer a signal for later consumption by the brain tick */
  async bufferSignal(tenantId: string, signal: TypedSignal): Promise<void> {
    const redis = getRedisConnection();
    const key = SIGNAL_BUFFER_KEY(tenantId);

    await redis.lpush(key, JSON.stringify(signal));
    // Cap buffer size to prevent unbounded growth
    await redis.ltrim(key, 0, MAX_SIGNALS_PER_TICK * 2 - 1);
    // Auto-expire buffer if brain isn't consuming (safety valve)
    await redis.expire(key, 300);
  }

  private async drainSignalBuffer(tenantId: string): Promise<TypedSignal[]> {
    const redis = getRedisConnection();
    const key = SIGNAL_BUFFER_KEY(tenantId);

    // Atomic drain: get all and delete
    const pipeline = redis.pipeline();
    pipeline.lrange(key, 0, MAX_SIGNALS_PER_TICK - 1);
    pipeline.del(key);
    const results = await pipeline.exec();

    if (!results || !results[0] || !results[0][1]) {
      return [];
    }

    const raw = results[0][1] as string[];
    return this.parseSignals(raw.map(r => {
      try { return JSON.parse(r); }
      catch { return null; }
    }).filter(Boolean));
  }

  private parseSignals(raw: unknown[]): TypedSignal[] {
    const parsed: TypedSignal[] = [];

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;

      const signal = item as Record<string, unknown>;
      if (!signal.type || !signal.tenantId || !signal.payload) continue;

      const signalType = signal.type as SignalType;
      const validation = safeValidateSignalPayload(signalType, signal.payload);

      if (validation.success) {
        parsed.push({
          id: (signal.id as string) || '',
          tenantId: signal.tenantId as string,
          type: signalType,
          sourceAgent: (signal.sourceAgent as string) || 'unknown',
          targetAgent: signal.targetAgent as string | undefined,
          payload: validation.data,
          priority: (signal.priority as TypedSignal['priority']) || 'medium',
          confidence: (signal.confidence as number) ?? 1,
          timestamp: (signal.timestamp as string) || new Date().toISOString(),
          correlationId: signal.correlationId as string | undefined,
          causedBy: signal.causedBy as string[] | undefined,
        });
      }
    }

    return parsed;
  }
}
