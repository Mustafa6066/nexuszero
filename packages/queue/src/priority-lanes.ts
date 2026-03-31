import type { TaskPriority } from '@nexuszero/shared';
import { getRedisConnection } from './bullmq-client.js';

// ---------------------------------------------------------------------------
// Priority Lanes — defines SLA targets and queue behavior per priority
// ---------------------------------------------------------------------------

export interface PriorityLane {
  priority: TaskPriority;
  /** BullMQ numeric priority (lower = higher priority) */
  bullmqPriority: number;
  /** Maximum time from queue entry to processing start (ms) */
  maxQueueTimeMs: number;
  /** Maximum time for task processing (ms) */
  maxProcessingTimeMs: number;
  /** Maximum end-to-end time (queue + processing) (ms) */
  maxTotalTimeMs: number;
  /** Worker concurrency weight — higher = more workers allocated */
  concurrencyWeight: number;
}

export const PRIORITY_LANES: Record<TaskPriority, PriorityLane> = {
  critical: {
    priority: 'critical',
    bullmqPriority: 1,
    maxQueueTimeMs: 10_000,        // 10s max queue wait
    maxProcessingTimeMs: 30_000,   // 30s max processing
    maxTotalTimeMs: 45_000,        // 45s end-to-end
    concurrencyWeight: 4,
  },
  high: {
    priority: 'high',
    bullmqPriority: 2,
    maxQueueTimeMs: 60_000,        // 1m max queue wait
    maxProcessingTimeMs: 300_000,  // 5m max processing
    maxTotalTimeMs: 360_000,       // 6m end-to-end
    concurrencyWeight: 3,
  },
  medium: {
    priority: 'medium',
    bullmqPriority: 3,
    maxQueueTimeMs: 300_000,       // 5m max queue wait
    maxProcessingTimeMs: 1_800_000, // 30m max processing
    maxTotalTimeMs: 3_600_000,     // 1h end-to-end
    concurrencyWeight: 2,
  },
  low: {
    priority: 'low',
    bullmqPriority: 4,
    maxQueueTimeMs: 1_800_000,     // 30m max queue wait
    maxProcessingTimeMs: 3_600_000, // 1h max processing
    maxTotalTimeMs: 7_200_000,     // 2h end-to-end
    concurrencyWeight: 1,
  },
};

// ---------------------------------------------------------------------------
// SLA tracking — records timing metrics per task
// ---------------------------------------------------------------------------

export interface SlaRecord {
  taskId: string;
  tenantId: string;
  agentType: string;
  taskType: string;
  priority: TaskPriority;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  queueTimeMs?: number;
  processingTimeMs?: number;
  totalTimeMs?: number;
  slaBreached: boolean;
  breachType?: 'queue_time' | 'processing_time' | 'total_time';
}

const SLA_KEY_PREFIX = 'sla';
const SLA_TTL = 7 * 24 * 60 * 60; // 7 days

export async function recordTaskQueued(taskId: string, tenantId: string, agentType: string, taskType: string, priority: TaskPriority): Promise<void> {
  let redis: ReturnType<typeof getRedisConnection>;
  try { redis = getRedisConnection(); } catch { return; }

  const record: SlaRecord = {
    taskId,
    tenantId,
    agentType,
    taskType,
    priority,
    queuedAt: Date.now(),
    slaBreached: false,
  };

  const key = `${SLA_KEY_PREFIX}:task:${taskId}`;
  await redis.setex(key, SLA_TTL, JSON.stringify(record));
}

export async function recordTaskStarted(taskId: string): Promise<SlaRecord | null> {
  let redis: ReturnType<typeof getRedisConnection>;
  try { redis = getRedisConnection(); } catch { return null; }

  const key = `${SLA_KEY_PREFIX}:task:${taskId}`;
  const raw = await redis.get(key);
  if (!raw) return null;

  const record: SlaRecord = JSON.parse(raw);
  const now = Date.now();
  record.startedAt = now;
  record.queueTimeMs = now - record.queuedAt;

  // Check queue time SLA
  const lane = PRIORITY_LANES[record.priority];
  if (record.queueTimeMs > lane.maxQueueTimeMs) {
    record.slaBreached = true;
    record.breachType = 'queue_time';
    await recordSlaBreach(record);
  }

  await redis.setex(key, SLA_TTL, JSON.stringify(record));
  return record;
}

export async function recordTaskCompleted(taskId: string): Promise<SlaRecord | null> {
  let redis: ReturnType<typeof getRedisConnection>;
  try { redis = getRedisConnection(); } catch { return null; }

  const key = `${SLA_KEY_PREFIX}:task:${taskId}`;
  const raw = await redis.get(key);
  if (!raw) return null;

  const record: SlaRecord = JSON.parse(raw);
  const now = Date.now();
  record.completedAt = now;
  record.processingTimeMs = record.startedAt ? now - record.startedAt : undefined;
  record.totalTimeMs = now - record.queuedAt;

  const lane = PRIORITY_LANES[record.priority];

  if (!record.slaBreached) {
    if (record.processingTimeMs && record.processingTimeMs > lane.maxProcessingTimeMs) {
      record.slaBreached = true;
      record.breachType = 'processing_time';
    } else if (record.totalTimeMs > lane.maxTotalTimeMs) {
      record.slaBreached = true;
      record.breachType = 'total_time';
    }
    if (record.slaBreached) {
      await recordSlaBreach(record);
    }
  }

  await redis.setex(key, SLA_TTL, JSON.stringify(record));

  // Update aggregate metrics
  await updateSlaMetrics(record);

  return record;
}

// ---------------------------------------------------------------------------
// SLA breach tracking & aggregate metrics
// ---------------------------------------------------------------------------

async function recordSlaBreach(record: SlaRecord): Promise<void> {
  let redis: ReturnType<typeof getRedisConnection>;
  try { redis = getRedisConnection(); } catch { return; }

  const date = new Date().toISOString().slice(0, 10);
  const pipeline = redis.pipeline();

  // Count breaches by tenant + date
  const tenantBreachKey = `${SLA_KEY_PREFIX}:breaches:${record.tenantId}:${date}`;
  pipeline.hincrby(tenantBreachKey, 'total', 1);
  pipeline.hincrby(tenantBreachKey, `priority:${record.priority}`, 1);
  pipeline.hincrby(tenantBreachKey, `type:${record.breachType ?? 'unknown'}`, 1);
  pipeline.expire(tenantBreachKey, SLA_TTL);

  // Global breach counter
  const globalBreachKey = `${SLA_KEY_PREFIX}:breaches:global:${date}`;
  pipeline.hincrby(globalBreachKey, 'total', 1);
  pipeline.hincrby(globalBreachKey, `agent:${record.agentType}`, 1);
  pipeline.expire(globalBreachKey, SLA_TTL);

  // Recent breach list for alerting
  const recentKey = `${SLA_KEY_PREFIX}:breaches:${record.tenantId}:recent`;
  pipeline.lpush(recentKey, JSON.stringify({
    taskId: record.taskId,
    taskType: record.taskType,
    priority: record.priority,
    breachType: record.breachType,
    queueTimeMs: record.queueTimeMs,
    processingTimeMs: record.processingTimeMs,
    timestamp: new Date().toISOString(),
  }));
  pipeline.ltrim(recentKey, 0, 49);
  pipeline.expire(recentKey, SLA_TTL);

  await pipeline.exec();
}

async function updateSlaMetrics(record: SlaRecord): Promise<void> {
  let redis: ReturnType<typeof getRedisConnection>;
  try { redis = getRedisConnection(); } catch { return; }

  const date = new Date().toISOString().slice(0, 10);
  const metricsKey = `${SLA_KEY_PREFIX}:metrics:${record.tenantId}:${date}`;
  const pipeline = redis.pipeline();

  pipeline.hincrby(metricsKey, 'totalTasks', 1);
  pipeline.hincrby(metricsKey, `priority:${record.priority}:total`, 1);
  if (record.slaBreached) {
    pipeline.hincrby(metricsKey, `priority:${record.priority}:breached`, 1);
  }
  if (record.totalTimeMs !== undefined) {
    pipeline.hincrbyfloat(metricsKey, 'totalTimeSum', record.totalTimeMs);
  }
  pipeline.expire(metricsKey, SLA_TTL);

  await pipeline.exec();
}

// ---------------------------------------------------------------------------
// SLA summary queries
// ---------------------------------------------------------------------------

export interface SlaSummary {
  totalTasks: number;
  totalBreaches: number;
  complianceRate: number;
  byPriority: Record<TaskPriority, { total: number; breached: number; complianceRate: number }>;
  avgTotalTimeMs: number;
  period: string;
}

export async function getTenantSlaSummary(tenantId: string, date?: string): Promise<SlaSummary | null> {
  let redis: ReturnType<typeof getRedisConnection>;
  try { redis = getRedisConnection(); } catch { return null; }

  const day = date ?? new Date().toISOString().slice(0, 10);
  const metricsKey = `${SLA_KEY_PREFIX}:metrics:${tenantId}:${day}`;
  const breachKey = `${SLA_KEY_PREFIX}:breaches:${tenantId}:${day}`;

  const [metrics, breaches] = await Promise.all([
    redis.hgetall(metricsKey),
    redis.hgetall(breachKey),
  ]);

  if (!metrics || Object.keys(metrics).length === 0) return null;

  const totalTasks = parseInt(metrics['totalTasks'] ?? '0', 10);
  const totalBreaches = parseInt(breaches['total'] ?? '0', 10);
  const totalTimeSum = parseFloat(metrics['totalTimeSum'] ?? '0');

  const priorities: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
  const byPriority = {} as SlaSummary['byPriority'];

  for (const p of priorities) {
    const total = parseInt(metrics[`priority:${p}:total`] ?? '0', 10);
    const breached = parseInt(metrics[`priority:${p}:breached`] ?? '0', 10);
    byPriority[p] = {
      total,
      breached,
      complianceRate: total > 0 ? ((total - breached) / total) * 100 : 100,
    };
  }

  return {
    totalTasks,
    totalBreaches,
    complianceRate: totalTasks > 0 ? ((totalTasks - totalBreaches) / totalTasks) * 100 : 100,
    byPriority,
    avgTotalTimeMs: totalTasks > 0 ? totalTimeSum / totalTasks : 0,
    period: day,
  };
}

export async function getRecentBreaches(tenantId: string, limit = 20): Promise<unknown[]> {
  let redis: ReturnType<typeof getRedisConnection>;
  try { redis = getRedisConnection(); } catch { return []; }

  const recentKey = `${SLA_KEY_PREFIX}:breaches:${tenantId}:recent`;
  const items = await redis.lrange(recentKey, 0, limit - 1);
  return items.map(item => JSON.parse(item));
}

// ---------------------------------------------------------------------------
// Dynamic priority elevation — upgrades task priority based on age
// ---------------------------------------------------------------------------

export function shouldElevatePriority(
  currentPriority: TaskPriority,
  queuedAtMs: number,
): TaskPriority | null {
  const elapsed = Date.now() - queuedAtMs;
  const lane = PRIORITY_LANES[currentPriority];

  // If a task has been waiting longer than 80% of its SLA queue time,
  // escalate to the next priority tier
  if (elapsed > lane.maxQueueTimeMs * 0.8) {
    const escalation: Record<TaskPriority, TaskPriority | null> = {
      low: 'medium',
      medium: 'high',
      high: 'critical',
      critical: null, // Already highest
    };
    return escalation[currentPriority];
  }

  return null;
}
