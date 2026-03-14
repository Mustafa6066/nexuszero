import { Worker, type Job, type WorkerOptions } from 'bullmq';
import {
  extractTraceContext,
  runWithTenantContextAsync,
  spanKindForMessagingConsumer,
  type TenantContext,
  QUEUE_NAMES,
  withSpan,
  injectTraceContext,
} from '@nexuszero/shared';
import { getDb, agents, agentTasks } from '@nexuszero/db';
import { and, eq } from 'drizzle-orm';
import { getBullMQConnection, getRedisConnection } from './bullmq-client.js';
import { publishTaskResult } from './producers.js';
import { parseTenantFromQueue } from './queues.js';
import type { TaskPayload, TaskResult } from './events.js';

export interface WorkerConfig {
  /** Base queue name (e.g. 'seo-tasks'). Workers listen on all tenant-scoped queues matching pattern */
  baseQueueName: string;
  /** Worker concurrency per queue */
  concurrency: number;
  /** Heartbeat interval in ms */
  heartbeatIntervalMs: number;
  /** Agent type label for heartbeats */
  agentLabel: string;
}

/**
 * Abstract base worker class for all agent services.
 * Handles: BullMQ worker lifecycle, tenant context injection, heartbeat emission,
 * structured logging, graceful shutdown on SIGTERM.
 */
export abstract class BaseAgentWorker {
  abstract readonly agentType: TaskPayload['agentType'];

  protected workers: Worker[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private shutdownRequested = false;
  private activeJobs = new Set<string>();
  private activeJobsByTenant = new Map<string, number>();
  private trackedTenantIds = new Set<string>();

  constructor(protected readonly config: WorkerConfig) {}

  /** Start the worker. Listens on all tenant-scoped queues for new jobs */
  async start(tenantIds: string[]): Promise<void> {
    // Create a worker for each tenant queue
    for (const tenantId of tenantIds) {
      const queueName = QUEUE_NAMES.forTenant(this.config.baseQueueName, tenantId);
      this.createWorkerForQueue(queueName);
    }

    // Also create a worker for the base (non-tenant-scoped) queue
    this.createWorkerForQueue(this.config.baseQueueName);

    // Start heartbeat
    this.startHeartbeat();

    // Graceful shutdown
    const shutdown = async () => {
      await this.stop();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    console.log(JSON.stringify({
      level: 'info',
      msg: `${this.config.agentLabel} worker started`,
      queues: tenantIds.length + 1,
      concurrency: this.config.concurrency,
    }));
  }

  /** Register a worker for an additional tenant (hot-add during runtime) */
  addTenantWorker(tenantId: string): void {
    if (this.trackedTenantIds.has(tenantId)) {
      return;
    }

    const queueName = QUEUE_NAMES.forTenant(this.config.baseQueueName, tenantId);
    this.trackedTenantIds.add(tenantId);
    this.createWorkerForQueue(queueName);
  }

  /** Gracefully stop all workers */
  async stop(): Promise<void> {
    this.shutdownRequested = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    console.log(JSON.stringify({ level: 'info', msg: `${this.config.agentLabel} shutting down`, activeJobs: this.activeJobs.size }));

    // Close all workers (waits for current jobs to finish)
    await Promise.all(this.workers.map(w => w.close()));
    this.workers = [];
  }

  /**
   * Subclasses implement this to process a task.
   * Runs within a tenant context (AsyncLocalStorage).
   * The BullMQ Job is provided so handlers can call job.updateProgress().
   */
  protected abstract processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>>;

  /** Optional: called after successful task completion */
  protected onTaskCompleted(_task: TaskPayload, _result: Record<string, unknown>): void {
    // Override in subclass if needed
  }

  /** Optional: called after task failure */
  protected onTaskFailed(_task: TaskPayload, _error: Error): void {
    // Override in subclass if needed
  }

  private createWorkerForQueue(queueName: string): void {
    const worker = new Worker<TaskPayload>(
      queueName,
      async (job: Job<TaskPayload>) => this.handleJob(job),
      {
        connection: getBullMQConnection(),
        concurrency: this.config.concurrency,
      },
    );

    worker.on('failed', (job, err) => {
      console.log(JSON.stringify({
        level: 'error',
        msg: 'Job failed',
        jobId: job?.id,
        taskType: job?.data?.taskType,
        tenantId: job?.data?.tenantId,
        error: err.message,
        attempt: job?.attemptsMade,
      }));
    });

    worker.on('error', (err) => {
      console.log(JSON.stringify({
        level: 'error',
        msg: 'Worker error',
        queue: queueName,
        error: err.message,
      }));
    });

    this.workers.push(worker);
  }

  private async handleJob(job: Job<TaskPayload>): Promise<unknown> {
    const task = job.data;
    const startTime = Date.now();
    this.activeJobs.add(task.taskId);
    this.incrementTenantActivity(task.tenantId);
    await this.markTaskStarted(task, startTime);

    const tenantContext: TenantContext = {
      tenantId: task.tenantId,
      plan: 'unknown', // Worker loads tenant config separately if needed
      requestId: task.correlationId,
    };

    try {
      const result = await withSpan('bullmq.task.process', {
        tracerName: `nexuszero.${this.config.agentLabel}`,
        kind: spanKindForMessagingConsumer(),
        parentContext: extractTraceContext(task.traceContext),
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.destination.name': job.queueName,
          'messaging.operation': 'process',
          'nexuszero.task.id': task.taskId,
          'nexuszero.task.type': task.taskType,
          'nexuszero.tenant.id': task.tenantId,
        },
      }, async () => runWithTenantContextAsync(tenantContext, () => this.processTask(task, job)));

      const taskResult: TaskResult = {
        taskId: task.taskId,
        tenantId: task.tenantId,
        agentType: task.agentType,
        taskType: task.taskType,
        status: 'completed',
        result,
        durationMs: Date.now() - startTime,
        correlationId: task.correlationId,
        traceContext: injectTraceContext(),
      };

      // Publish result to Kafka for downstream consumers
      await publishTaskResult(taskResult).catch(err => {
        console.log(JSON.stringify({ level: 'warn', msg: 'Failed to publish task result', error: (err as Error).message }));
      });

      this.onTaskCompleted(task, result);

      console.log(JSON.stringify({
        level: 'info',
        msg: 'Task completed',
        taskId: task.taskId,
        taskType: task.taskType,
        tenantId: task.tenantId,
        durationMs: Date.now() - startTime,
      }));

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      const taskResult: TaskResult = {
        taskId: task.taskId,
        tenantId: task.tenantId,
        agentType: task.agentType,
        taskType: task.taskType,
        status: 'failed',
        error: err.message,
        durationMs: Date.now() - startTime,
        correlationId: task.correlationId,
        traceContext: injectTraceContext(),
      };

      await publishTaskResult(taskResult).catch(pubErr => {
        console.log(JSON.stringify({ level: 'warn', msg: 'Failed to publish failure result', error: (pubErr as Error).message }));
      });

      this.onTaskFailed(task, err);
      throw error;
    } finally {
      this.activeJobs.delete(task.taskId);
      this.decrementTenantActivity(task.tenantId);
      await this.touchAgentHeartbeat(task.tenantId);
    }
  }

  private startHeartbeat(): void {
    const redis = getRedisConnection();
    this.heartbeatInterval = setInterval(async () => {
      try {
        const timestamp = new Date();
        const heartbeat = {
          agentType: this.config.agentLabel,
          activeJobs: this.activeJobs.size,
          workerCount: this.workers.length,
          uptime: process.uptime(),
          memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          timestamp: timestamp.toISOString(),
        };
        await redis.setex(
          `agent:${this.config.agentLabel}:heartbeat`,
          Math.ceil(this.config.heartbeatIntervalMs / 1000) * 3,
          JSON.stringify(heartbeat),
        );

        await Promise.all(
          [...this.trackedTenantIds].map((tenantId) => this.touchAgentHeartbeat(tenantId, timestamp)),
        );
      } catch (err) {
        console.log(JSON.stringify({
          level: 'warn',
          msg: 'Heartbeat failed',
          error: (err as Error).message,
        }));
      }
    }, this.config.heartbeatIntervalMs);
  }

  private incrementTenantActivity(tenantId: string): void {
    this.trackedTenantIds.add(tenantId);
    this.activeJobsByTenant.set(tenantId, (this.activeJobsByTenant.get(tenantId) ?? 0) + 1);
  }

  private decrementTenantActivity(tenantId: string): void {
    const next = Math.max(0, (this.activeJobsByTenant.get(tenantId) ?? 1) - 1);
    if (next === 0) {
      this.activeJobsByTenant.delete(tenantId);
      return;
    }

    this.activeJobsByTenant.set(tenantId, next);
  }

  private async markTaskStarted(task: TaskPayload, startTime: number): Promise<void> {
    const db = getDb();
    const startedAt = new Date(startTime);

    await db.update(agentTasks)
      .set({
        status: 'processing',
        startedAt,
        updatedAt: startedAt,
      })
      .where(eq(agentTasks.id, task.taskId));

    await db.update(agents)
      .set({
        status: 'processing',
        currentTaskId: task.taskId,
        lastHeartbeat: startedAt,
        updatedAt: startedAt,
      })
      .where(and(eq(agents.tenantId, task.tenantId), eq(agents.type, task.agentType)));
  }

  private async touchAgentHeartbeat(tenantId: string, timestamp = new Date()): Promise<void> {
    const activeJobs = this.activeJobsByTenant.get(tenantId) ?? 0;
    const db = getDb();

    await db.update(agents)
      .set({
        status: activeJobs > 0 ? 'processing' : 'idle',
        currentTaskId: activeJobs > 0 ? undefined : null,
        lastHeartbeat: timestamp,
        updatedAt: timestamp,
      })
      .where(and(eq(agents.tenantId, tenantId), eq(agents.type, this.agentType)));
  }
}
