export { getRedisConnection, getBullMQConnection, createQueue, createWorker, closeRedisConnection } from './bullmq-client.js';
export { publishToKafka, consumeFromKafka, createKafkaTopic } from './kafka-client.js';
export { QUEUE_NAMES, getTenantQueue, getAllTenantQueues, parseTenantFromQueue, getQueuePattern } from './queues.js';
export {
  publishAgentTask, publishTaskResult, publishAgentSignal,
  publishWebhookDelivery, publishOnboardingStep, publishWebhookEvent,
  publishAuditEvent, closeAllQueues,
} from './producers.js';
export type { PublishAgentSignalInput, PublishAgentTaskInput } from './producers.js';
export { BaseAgentWorker, type WorkerConfig } from './base-worker.js';
export type {
  InterAgentEventType, InterAgentEvent, TaskPayload, TaskResult,
  WebhookDeliveryPayload, OnboardingPayload,
} from './events.js';
