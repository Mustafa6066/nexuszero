import { randomUUID } from 'node:crypto';
import { publishAgentTask } from '@nexuszero/queue';
import { getDb, withTenantDb, agentTasks, tenants } from '@nexuszero/db';
import { TASK_TO_AGENT_MAP, TASK_PRIORITY_DEFAULTS, PLAN_AGENT_LIMITS, AppError, ERROR_CODES, dispatchNotification, buildAnomalyNotification } from '@nexuszero/shared';
import type { TaskPriority } from '@nexuszero/shared';
import { eq, and, asc, sql } from 'drizzle-orm';
import { TaskGraphExecutor } from './task-graph.js';

async function dispatchTask(task: {
  id: string;
  tenantId: string;
  type: string;
  priority: TaskPriority;
  input?: Record<string, unknown>;
}) {
  const agentType = TASK_TO_AGENT_MAP[task.type];
  if (!agentType) {
    throw new AppError(ERROR_CODES.AGENT.INVALID_TYPE, `Unknown task type: ${task.type}`, 400);
  }

  await publishAgentTask({
    id: task.id,
    tenantId: task.tenantId,
    agentType,
    type: task.type,
    priority: task.priority,
    input: task.input || {},
  });

  return agentType;
}

async function getDispatchCapacity(tenantId: string): Promise<number> {
  return withTenantDb(tenantId, async (db: ReturnType<typeof getDb>) => {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.tenantId, tenantId),
          sql`${agentTasks.status} IN ('processing', 'retrying')`,
        ),
      );

    const [tenant] = await db
      .select({ plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const plan = ((tenant?.plan as string) || 'launchpad') as keyof typeof PLAN_AGENT_LIMITS;
    const limit = PLAN_AGENT_LIMITS[plan]?.maxConcurrentTasks ?? 5;
    return Math.max(0, limit - (row?.count ?? 0));
  });
}

export async function dispatchQueuedTasksForTenant(tenantId: string): Promise<number> {
  const capacity = await getDispatchCapacity(tenantId);
  if (capacity <= 0) {
    return 0;
  }

  return withTenantDb(tenantId, async (db: ReturnType<typeof getDb>) => {
    const pendingTasks = await db.select({
      id: agentTasks.id,
      type: agentTasks.type,
      priority: agentTasks.priority,
      input: agentTasks.input,
    })
      .from(agentTasks)
      .where(and(eq(agentTasks.tenantId, tenantId), eq(agentTasks.status, 'pending')))
      .orderBy(asc(agentTasks.createdAt))
      .limit(capacity);

    let dispatched = 0;

    for (const task of pendingTasks) {
      try {
        await dispatchTask({
          id: task.id,
          tenantId,
          type: task.type,
          priority: task.priority as TaskPriority,
          input: (task.input as Record<string, unknown> | null) || {},
        });

        await db.update(agentTasks)
          .set({
            status: 'queued',
            scheduledFor: null,
            updatedAt: new Date(),
          })
          .where(eq(agentTasks.id, task.id));

        dispatched += 1;
      } catch (error) {
        await db.update(agentTasks)
          .set({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(agentTasks.id, task.id));
      }
    }

    return dispatched;
  });
}

export class TaskRouter {
  /**
   * Route an incoming task to the appropriate agent queue.
   * Validates concurrency limits and publishes to BullMQ.
   */
  async routeTask(task: {
    id: string;
    tenantId: string;
    type: string;
    priority?: TaskPriority;
    input?: any;
  }) {
    const agentType = TASK_TO_AGENT_MAP[task.type];
    if (!agentType) {
      throw new AppError(ERROR_CODES.AGENT.INVALID_TYPE, `Unknown task type: ${task.type}`, 400);
    }

    const priority = task.priority || TASK_PRIORITY_DEFAULTS[task.type] || 'medium';

    // Check concurrency limits
    const allowed = await this.checkConcurrencyLimit(task.tenantId, agentType);

    // Record task in database
    const db = getDb();
    await db.insert(agentTasks).values({
      id: task.id,
      tenantId: task.tenantId,
      type: task.type,
      priority,
      status: allowed ? 'queued' : 'pending',
      input: task.input || {},
    });

    if (!allowed) {
      console.log(`Concurrency limit hit for tenant ${task.tenantId}, agent ${agentType}. Task ${task.id} recorded as pending.`);
      return { taskId: task.id, agentType, priority, queued: true };
    }

    await dispatchTask({
      id: task.id,
      tenantId: task.tenantId,
      type: task.type,
      priority,
      input: task.input || {},
    });

    console.log(`Routed task ${task.id} (${task.type}) to ${agentType} for tenant ${task.tenantId}`);
    return { taskId: task.id, agentType, priority, queued: false };
  }

  /**
   * Handle task failure — retry or escalate
   */
  async onTaskFailed(result: { taskId: string; tenantId: string; error: string; type: string }) {
    return withTenantDb(result.tenantId, async (db: ReturnType<typeof getDb>) => {
      const [task] = await db.select().from(agentTasks)
        .where(eq(agentTasks.id, result.taskId))
        .limit(1);

      if (!task) return;

      if (task.attempts < task.maxAttempts) {
        // Retry with exponential backoff
        const delay = Math.pow(2, task.attempts) * 1000;
        console.log(`Retrying task ${task.id} (attempt ${task.attempts + 1}/${task.maxAttempts}) in ${delay}ms`);

        await db.update(agentTasks)
          .set({ status: 'retrying', attempts: task.attempts + 1, error: result.error, updatedAt: new Date() })
          .where(eq(agentTasks.id, task.id));

        const agentType = TASK_TO_AGENT_MAP[task.type];
        if (agentType) {
          await publishAgentTask({
            id: task.id,
            tenantId: result.tenantId,
            agentType,
            type: task.type,
            priority: task.priority as TaskPriority,
            input: task.input as any,
            delay,
          });
        }
      } else {
        // Max retries exceeded — mark as failed
        await db.update(agentTasks)
          .set({ status: 'failed', error: result.error, completedAt: new Date(), updatedAt: new Date() })
          .where(eq(agentTasks.id, task.id));

        console.error(`Task ${task.id} permanently failed after ${task.maxAttempts} attempts: ${result.error}`);
      }

      await dispatchQueuedTasksForTenant(result.tenantId);
    });
  }

  /**
   * Handle inter-agent signals — coordinate between agents.
   * Enhanced with dynamic DAG re-wiring for anomaly response.
   */
  async onAgentSignal(signal: { tenantId: string; agentId: string; type: string; data: any }) {
    const signalHandlers: Record<string, () => Promise<void>> = {
      'seo_keywords_updated': async () => {
        // Tell ad agent about new keywords
        await this.routeTask({
          id: randomUUID(),
          tenantId: signal.tenantId,
          type: 'sync_keywords',
          priority: 'medium',
          input: signal.data,
        });
      },
      'creative_generated': async () => {
        // Tell data-nexus to analyze creative performance prediction
        await this.routeTask({
          id: randomUUID(),
          tenantId: signal.tenantId,
          type: 'predict_performance',
          priority: 'low',
          input: signal.data,
        });
      },
      'anomaly_detected': async () => {
        // Dynamic DAG: build a reactive response graph based on severity
        const severity = signal.data?.severity ?? 'medium';
        const investigateId = randomUUID();
        const alertId = randomUUID();

        const nodes: { taskId: string; type: string; input: any; dependsOn: string[] }[] = [
          // Root: investigate the anomaly
          {
            taskId: investigateId,
            type: 'investigate_anomaly',
            input: { ...signal.data, originSignal: 'anomaly_detected' },
            dependsOn: [],
          },
          // Always: alert the user after investigation
          {
            taskId: alertId,
            type: 'alert_management',
            input: { ...signal.data, investigateTaskId: investigateId },
            dependsOn: [investigateId],
          },
        ];

        // High/critical: pause affected campaign + generate replacement creatives
        if (severity === 'high' || severity === 'critical') {
          nodes.push({
            taskId: randomUUID(),
            type: 'budget_allocation',
            input: { action: 'pause_anomalous', campaignId: signal.data?.campaignId, ...signal.data },
            dependsOn: [investigateId],
          });
          nodes.push({
            taskId: randomUUID(),
            type: 'copy_generation',
            input: { reason: 'anomaly_replacement', campaignId: signal.data?.campaignId, ...signal.data },
            dependsOn: [investigateId],
          });
        }

        const graphExecutor = new TaskGraphExecutor();
        await graphExecutor.executeGraph(signal.tenantId, nodes, 'critical');

        // Push real-time notification to Slack/Teams
        dispatchNotification(signal.tenantId, buildAnomalyNotification(
          signal.data?.metric ?? 'Unknown metric',
          severity === 'critical' ? 'critical' : 'warning',
          `Anomaly detected${signal.data?.campaignId ? ` in campaign ${signal.data.campaignId}` : ''}. Investigation DAG launched with ${nodes.length} tasks.`,
          signal.data?.dashboardUrl,
        )).catch((err) => {
          console.warn('Failed to dispatch anomaly notification:', (err as Error).message);
        });
      },
      'anomaly_escalated': async () => {
        // Data Nexus completed investigation and determined a pivot is needed.
        // Inject creative + ad tasks into the existing graph if we have a graphId,
        // otherwise route as standalone tasks.
        const graphId = signal.data?.graphId;
        const pivotActions = signal.data?.pivotActions ?? ['generate_creative', 'adjust_bids'];

        if (graphId) {
          const graphExecutor = new TaskGraphExecutor();
          const pivotNodes = pivotActions.map((action: string) => ({
            taskId: randomUUID(),
            type: action === 'generate_creative' ? 'copy_generation' : 'bid_optimization',
            input: { ...signal.data, reason: 'anomaly_pivot' },
            dependsOn: [],
          }));

          await graphExecutor.injectNodes(graphId, signal.tenantId, pivotNodes, 'high');
        } else {
          // Fallback: dispatch as individual tasks
          for (const action of pivotActions) {
            await this.routeTask({
              id: randomUUID(),
              tenantId: signal.tenantId,
              type: action === 'generate_creative' ? 'copy_generation' : 'bid_optimization',
              priority: 'high',
              input: { ...signal.data, reason: 'anomaly_pivot' },
            });
          }
        }
      },
      'creative_critiqued': async () => {
        // Critic evaluated a creative — route to performance prediction if passed
        if (signal.data?.verdict === 'pass') {
          await this.routeTask({
            id: randomUUID(),
            tenantId: signal.tenantId,
            type: 'predict_performance',
            priority: 'low',
            input: signal.data,
          });
        }
      },
      'aeo_citation_found': async () => {
        // Update SEO strategy based on AI citation findings
        await this.routeTask({
          id: randomUUID(),
          tenantId: signal.tenantId,
          type: 'update_seo_strategy',
          priority: 'medium',
          input: signal.data,
        });
      },
      'aeo.probe_completed': async () => {
        // Trigger visibility scoring after probes complete
        await this.routeTask({
          id: randomUUID(),
          tenantId: signal.tenantId,
          type: 'ai_visibility_scoring',
          priority: 'medium',
          input: signal.data,
        });
      },
      'cms.change_proposed': async () => {
        // Log proposed CMS changes; auto-approve safe actions or queue for review
        console.log(`CMS change proposed for tenant ${signal.tenantId}:`, signal.data);
      },
    };

    const handler = signalHandlers[signal.type];
    if (handler) {
      await handler();
    } else {
      console.log(`Unhandled signal type: ${signal.type}`);
    }
  }

  private async checkConcurrencyLimit(tenantId: string, _agentType: string): Promise<boolean> {
    return (await getDispatchCapacity(tenantId)) > 0;
  }
}
