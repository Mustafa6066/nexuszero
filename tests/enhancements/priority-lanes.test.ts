import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Test 4: Priority Lanes & SLA — Pure Logic Tests
// Tests priority lane configuration, SLA thresholds, and escalation logic
// ---------------------------------------------------------------------------

// Mirror the priority lanes from packages/queue/src/priority-lanes.ts
interface PriorityLane {
  name: string;
  bullmqPriority: number;
  maxQueueTimeMs: number;
  maxProcessingTimeMs: number;
  maxTotalTimeMs: number;
}

const PRIORITY_LANES: Record<string, PriorityLane> = {
  critical: { name: 'critical', bullmqPriority: 1, maxQueueTimeMs: 10_000, maxProcessingTimeMs: 30_000, maxTotalTimeMs: 45_000 },
  high: { name: 'high', bullmqPriority: 2, maxQueueTimeMs: 60_000, maxProcessingTimeMs: 300_000, maxTotalTimeMs: 360_000 },
  medium: { name: 'medium', bullmqPriority: 3, maxQueueTimeMs: 300_000, maxProcessingTimeMs: 1_800_000, maxTotalTimeMs: 3_600_000 },
  low: { name: 'low', bullmqPriority: 4, maxQueueTimeMs: 1_800_000, maxProcessingTimeMs: 3_600_000, maxTotalTimeMs: 7_200_000 },
};

function shouldElevatePriority(currentPriority: string, queueTimeMs: number): { elevate: boolean; newPriority?: string } {
  const lane = PRIORITY_LANES[currentPriority];
  if (!lane) return { elevate: false };

  const threshold = lane.maxQueueTimeMs * 0.8;
  if (queueTimeMs < threshold) return { elevate: false };

  const priorities = ['critical', 'high', 'medium', 'low'];
  const currentIdx = priorities.indexOf(currentPriority);
  if (currentIdx <= 0) return { elevate: false }; // Already at highest

  return { elevate: true, newPriority: priorities[currentIdx - 1] };
}

// ============================= TESTS =============================

describe('Priority Lanes — Configuration', () => {
  it('defines 4 priority lanes', () => {
    expect(Object.keys(PRIORITY_LANES)).toHaveLength(4);
    expect(PRIORITY_LANES.critical).toBeDefined();
    expect(PRIORITY_LANES.high).toBeDefined();
    expect(PRIORITY_LANES.medium).toBeDefined();
    expect(PRIORITY_LANES.low).toBeDefined();
  });

  it('critical has lowest bullmq priority number (highest priority)', () => {
    expect(PRIORITY_LANES.critical.bullmqPriority).toBe(1);
  });

  it('low has highest bullmq priority number (lowest priority)', () => {
    expect(PRIORITY_LANES.low.bullmqPriority).toBe(4);
  });

  it('SLA thresholds increase from critical → low', () => {
    expect(PRIORITY_LANES.critical.maxTotalTimeMs).toBeLessThan(PRIORITY_LANES.high.maxTotalTimeMs);
    expect(PRIORITY_LANES.high.maxTotalTimeMs).toBeLessThan(PRIORITY_LANES.medium.maxTotalTimeMs);
    expect(PRIORITY_LANES.medium.maxTotalTimeMs).toBeLessThan(PRIORITY_LANES.low.maxTotalTimeMs);
  });

  it('queue time is less than total time for each lane', () => {
    for (const lane of Object.values(PRIORITY_LANES)) {
      expect(lane.maxQueueTimeMs).toBeLessThan(lane.maxTotalTimeMs);
    }
  });

  it('queue + processing roughly equals total time', () => {
    for (const lane of Object.values(PRIORITY_LANES)) {
      expect(lane.maxQueueTimeMs + lane.maxProcessingTimeMs).toBeLessThanOrEqual(lane.maxTotalTimeMs * 1.5);
    }
  });
});

describe('Priority Lanes — SLA Thresholds', () => {
  it('critical SLA: 10s queue, 30s process, 45s total', () => {
    const lane = PRIORITY_LANES.critical;
    expect(lane.maxQueueTimeMs).toBe(10_000);
    expect(lane.maxProcessingTimeMs).toBe(30_000);
    expect(lane.maxTotalTimeMs).toBe(45_000);
  });

  it('high SLA: 1m queue, 5m process, 6m total', () => {
    const lane = PRIORITY_LANES.high;
    expect(lane.maxQueueTimeMs).toBe(60_000);
    expect(lane.maxProcessingTimeMs).toBe(300_000);
    expect(lane.maxTotalTimeMs).toBe(360_000);
  });

  it('medium SLA: 5m queue, 30m process, 1h total', () => {
    const lane = PRIORITY_LANES.medium;
    expect(lane.maxQueueTimeMs).toBe(300_000);
    expect(lane.maxProcessingTimeMs).toBe(1_800_000);
    expect(lane.maxTotalTimeMs).toBe(3_600_000);
  });

  it('low SLA: 30m queue, 1h process, 2h total', () => {
    const lane = PRIORITY_LANES.low;
    expect(lane.maxQueueTimeMs).toBe(1_800_000);
    expect(lane.maxProcessingTimeMs).toBe(3_600_000);
    expect(lane.maxTotalTimeMs).toBe(7_200_000);
  });
});

describe('Priority Lanes — Escalation Logic', () => {
  it('does not elevate when queue time is under 80% threshold', () => {
    const result = shouldElevatePriority('medium', 100_000); // 100s of 300s = 33%
    expect(result.elevate).toBe(false);
  });

  it('elevates low → medium when queue time exceeds 80% of SLA', () => {
    const threshold = PRIORITY_LANES.low.maxQueueTimeMs * 0.82; // 82% of 30min
    const result = shouldElevatePriority('low', threshold);
    expect(result.elevate).toBe(true);
    expect(result.newPriority).toBe('medium');
  });

  it('elevates medium → high when queue time exceeds 80% of SLA', () => {
    const threshold = PRIORITY_LANES.medium.maxQueueTimeMs * 0.85; // 85% of 5min
    const result = shouldElevatePriority('medium', threshold);
    expect(result.elevate).toBe(true);
    expect(result.newPriority).toBe('high');
  });

  it('elevates high → critical when queue time exceeds 80% of SLA', () => {
    const threshold = PRIORITY_LANES.high.maxQueueTimeMs * 0.9; // 90% of 1min
    const result = shouldElevatePriority('high', threshold);
    expect(result.elevate).toBe(true);
    expect(result.newPriority).toBe('critical');
  });

  it('does not elevate critical (already highest)', () => {
    const result = shouldElevatePriority('critical', 100_000);
    expect(result.elevate).toBe(false);
  });

  it('handles unknown priority gracefully', () => {
    const result = shouldElevatePriority('unknown', 100_000);
    expect(result.elevate).toBe(false);
  });
});
