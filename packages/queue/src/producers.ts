import { randomUUID } from 'node:crypto';
import { QUEUE_NAMES, KAFKA_TOPICS, AppError, injectTraceContext } from '@nexuszero/shared';
import type { AgentType, TaskPriority } from '@nexuszero/shared';
import { publishToKafka } from './kafka-client.js';
import { getTenantQueue } from './queues.js';
import type { TaskPayload, InterAgentEvent, WebhookDeliveryPayload, OnboardingPayload, TaskResult } from './events.js';
import { createQueue as createBullQueue } from './bullmq-client.js';

// ---------------------------------------------------------------------------
// Queue cache — lazily created BullMQ queues keyed by name
// ---------------------------------------------------------------------------

const queueCache = new Map<string, ReturnType<typeof createBullQueue>>();

function getOrCreateQueue<T>(name: string): ReturnType<typeof createBullQueue<T>> {
  if (!queueCache.has(name)) {
    queueCache.set(name, createBullQueue(name));
  }
  return queueCache.get(name)! as ReturnType<typeof createBullQueue<T>>;
}

// ---------------------------------------------------------------------------
// publishAgentTask
// Accepts the object form used by all callers throughout the codebase.
// ---------------------------------------------------------------------------

export interface PublishAgentTaskInput {
  /** Optional caller-supplied ID; a UUID is generated if omitted */
  id?: string;
  tenantId: string;
  agentType: AgentType;
  /** Task type string, e.g. 'seo_audit', 'optimize_bids' */
  type: string;
  priority?: TaskPriority;
  /** Task input payload */
  input?: Record<string, unknown>;
  /** BullMQ job delay in milliseconds (for retry back-off) */
  delay?: number;
  maxRetries?: number;
  scheduledAt?: string;
  dependsOn?: string[];
}

/** Publish a task to a tenant-scoped agent queue */
export async function publishAgentTask(task: PublishAgentTaskInput): Promise<string> {
  const queuePrefixes: Record<AgentType, string> = {
    seo: QUEUE_NAMES.SEO_TASKS,
    ad: QUEUE_NAMES.AD_TASKS,
    creative: QUEUE_NAMES.CREATIVE_TASKS,
    'data-nexus': QUEUE_NAMES.DATA_TASKS,
    aeo: QUEUE_NAMES.AEO_TASKS,
    compatibility: QUEUE_NAMES.COMPATIBILITY_TASKS,
  };

  const baseQueue = queuePrefixes[task.agentType];
  if (!baseQueue) {
    throw new Error(`Unknown agentType: ${task.agentType}`);
  }

  const queueName = getTenantQueue(baseQueue, task.tenantId);
  const taskId = task.id ?? randomUUID();

  const taskPayload: TaskPayload = {
    taskId,
    tenantId: task.tenantId,
    agentType: task.agentType,
    taskType: task.type,
    priority: task.priority ?? 'medium',
    payload: task.input ?? {},
    correlationId: randomUUID(),
    maxRetries: task.maxRetries ?? 3,
    scheduledAt: task.scheduledAt,
    dependsOn: task.dependsOn,
    traceContext: injectTraceContext(),
  };

  try {
    const queue = getOrCreateQueue<TaskPayload>(queueName);

    await Promise.race([
      queue.add(task.type, taskPayload, {
        jobId: taskId,
        priority: ({ critical: 1, high: 2, medium: 3, low: 4 } as const)[taskPayload.priority],
        delay: task.delay ?? (task.scheduledAt ? Math.max(0, new Date(task.scheduledAt).getTime() - Date.now()) : undefined),
        attempts: taskPayload.maxRetries,
        backoff: { type: 'exponential', delay: 1000 },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('BullMQ queue.add timed out after 5s')), 5_000)
      ),
    ]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', msg: 'publishAgentTask failed', error: reason, queue: queueName, taskType: task.type }));
    if (err instanceof Error && err.message.includes('Redis is not configured')) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        { reason: 'Redis queue is not configured. Set REDIS_PRIVATE_URL or REDIS_URL on this service.' },
        'Task queue is unavailable because Redis is not configured',
      );
    }

    throw new AppError('SERVICE_UNAVAILABLE', { reason: 'Task queue temporarily unavailable' });
  }

  return taskId;
}

// ---------------------------------------------------------------------------
// publishTaskResult — Kafka notification for task completion / failure
// ---------------------------------------------------------------------------

/** Publish task result to Kafka for downstream consumers */
export async function publishTaskResult(result: TaskResult): Promise<void> {
  const topic = result.status === 'completed' ? KAFKA_TOPICS.TASKS_COMPLETED : KAFKA_TOPICS.TASKS_FAILED;
  const enrichedResult: TaskResult = {
    ...result,
    traceContext: result.traceContext ?? injectTraceContext(),
  };

  await publishToKafka(topic, enrichedResult as unknown as Record<string, unknown>, result.tenantId, {
    headers: enrichedResult.traceContext,
  });
}

// ---------------------------------------------------------------------------
// publishAgentSignal — inter-agent coordination via Kafka
// Callers use the simplified form {tenantId, agentId, type, data}.
// ---------------------------------------------------------------------------

export interface PublishAgentSignalInput {
  tenantId: string;
  /** Source agent identifier — use agentId or sourceAgent interchangeably */
  agentId?: string;
  sourceAgent?: string;
  /** Optional routing hint for subscribers */
  targetAgent?: string;
  /** Signal type, e.g. 'seo_keywords_updated' */
  type: string;
  /** Signal payload — use data or payload interchangeably */
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  priority?: 'high' | 'medium' | 'low';
  confidence?: number;
  correlationId?: string;
}

/** Publish an inter-agent signal via Kafka */
export async function publishAgentSignal(signal: PublishAgentSignalInput): Promise<void> {
  const event = {
    id: randomUUID(),
    tenantId: signal.tenantId,
    sourceAgent: signal.agentId ?? signal.sourceAgent ?? 'unknown',
    targetAgent: signal.targetAgent,
    type: signal.type,
    payload: signal.data ?? signal.payload ?? {},
    priority: signal.priority,
    confidence: signal.confidence,
    correlationId: signal.correlationId,
    timestamp: new Date().toISOString(),
    traceContext: injectTraceContext(),
  };

  // Publish to global signals topic for the orchestrator
  await publishToKafka(KAFKA_TOPICS.AGENTS_SIGNALS, event, signal.tenantId, {
    headers: event.traceContext,
  });
}

// ---------------------------------------------------------------------------
// publishWebhookDelivery — queue a webhook delivery job in BullMQ
// ---------------------------------------------------------------------------

/** Publish a webhook delivery job */
export async function publishWebhookDelivery(delivery: WebhookDeliveryPayload): Promise<void> {
  const queue = getOrCreateQueue<WebhookDeliveryPayload>(QUEUE_NAMES.WEBHOOK_DELIVERY);
  await queue.add('deliver', delivery, {
    attempts: delivery.maxRetries,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

// ---------------------------------------------------------------------------
// publishOnboardingStep — queue an onboarding step job in BullMQ
// ---------------------------------------------------------------------------

/** Publish an onboarding step job */
export async function publishOnboardingStep(step: OnboardingPayload): Promise<void> {
  const queue = getOrCreateQueue<OnboardingPayload>(QUEUE_NAMES.ONBOARDING);
  await queue.add(step.step, {
    ...step,
    traceContext: step.traceContext ?? injectTraceContext(),
  }, {
    priority: 1, // Onboarding is always high priority
  });
}

// ---------------------------------------------------------------------------
// publishWebhookEvent — fire a logical webhook event (not a delivery job).
// The dispatcher service is responsible for finding matching endpoints and
// enqueuing the actual HTTP deliveries.
// ---------------------------------------------------------------------------

/** Publish a webhook event to Kafka so the dispatcher can fan it out */
export async function publishWebhookEvent(
  tenantId: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  const event = {
    id: randomUUID(),
    tenantId,
    eventType,
    data,
    timestamp: new Date().toISOString(),
    traceContext: injectTraceContext(),
  };
  await publishToKafka(KAFKA_TOPICS.EVENTS_WEBHOOK, event, tenantId, {
    headers: event.traceContext,
  });
}

// ---------------------------------------------------------------------------
// publishAuditEvent — write an audit log entry via Kafka
// ---------------------------------------------------------------------------

/** Publish an audit event to Kafka */
export async function publishAuditEvent(
  tenantId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  const event = {
    id: randomUUID(),
    tenantId,
    action,
    details,
    timestamp: new Date().toISOString(),
    traceContext: injectTraceContext(),
  };
  await publishToKafka(KAFKA_TOPICS.EVENTS_AUDIT, event, tenantId, {
    headers: event.traceContext,
  });
}

// ---------------------------------------------------------------------------
// closeAllQueues — graceful shutdown helper
// ---------------------------------------------------------------------------

/** Close all cached BullMQ queues */
export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queueCache.values()].map(q => q.close()));
  queueCache.clear();
}
