export { getRedisConnection, getBullMQConnection, createQueue, createWorker, closeRedisConnection } from './bullmq-client.js';
export { publishToKafka, consumeFromKafka, createKafkaTopic, closeKafkaConnections } from './kafka-client.js';
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
export {
  proposeCmsChange, approveCmsChange, rejectCmsChange,
  type CmsChangeRequest, type CmsChangeScope,
} from './cms-propose.js';
export {
  PRIORITY_LANES, recordTaskQueued, recordTaskStarted, recordTaskCompleted,
  getTenantSlaSummary, getRecentBreaches, shouldElevatePriority,
} from './priority-lanes.js';
export type { PriorityLane, SlaRecord, SlaSummary } from './priority-lanes.js';
export {
  SIGNAL_SCHEMAS, AGENT_SIGNAL_SUBSCRIPTIONS,
  validateSignalPayload, safeValidateSignalPayload,
} from './signal-schemas.js';
export type { SignalType, SignalPayload, TypedSignal } from './signal-schemas.js';
export {
  storeMemory, recallMemories, reinforceMemory, decayMemory,
  getMemoryStats, pruneMemories,
} from './agent-memory.js';
export type { StoreMemoryInput, RecallOptions, MemoryEntry } from './agent-memory.js';
export { attemptConsolidation } from './memory-consolidation.js';
export {
  recordAction, generateSummary, getCurrentSummary,
  getTenantAgentSummaries, clearTaskSummary, SUMMARY_INTERVAL_MS,
} from './agent-summary.js';
export type { AgentSummary } from './agent-summary.js';
export {
  getToolPermissions, isToolAllowed, setToolOverrides, clearToolOverrides,
} from './tool-access.js';
export type { ToolCategory, ToolPermissions } from './tool-access.js';
export {
  requestApproval, approveRequest, rejectRequest,
  getPendingApprovals, expireOldApprovals,
} from './plan-approval.js';
export type { ApprovalRequest, ApprovalResult } from './plan-approval.js';
export { publishWsEvent } from './ws-events.js';
