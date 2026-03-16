import { randomUUID } from 'node:crypto';
import { getDb, agentTasks } from '@nexuszero/db';
import { publishAgentTask } from '@nexuszero/queue';
import { TASK_TO_AGENT_MAP } from '@nexuszero/shared';
import type { TaskPriority } from '@nexuszero/shared';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { dispatchQueuedTasksForTenant } from './task-router.js';

interface TaskGraphNode {
  taskId: string;
  type: string;
  input: any;
  dependsOn: string[];
}

interface TaskGraphState {
  tenantId: string;
  nodes: TaskGraphNode[];
  completedTasks: string[];
  failedTasks: string[];
  dispatchedTasks: string[];
}

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_PRIVATE_URL || process.env.REDIS_URL;
    if (!redisUrl && (process.env.NODE_ENV === 'production' || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_ENVIRONMENT_NAME)) {
      throw new Error('Redis is not configured. Set REDIS_PRIVATE_URL or REDIS_URL for the orchestrator service.');
    }

    redis = new Redis(redisUrl || 'redis://localhost:6379');
    redis.on('error', () => {});
  }

  return redis;
}

export class TaskGraphExecutor {
  /**
   * Create and execute a DAG of tasks.
   * Tasks with no dependencies start immediately.
   * Dependent tasks start when all their dependencies complete.
   */
  async executeGraph(tenantId: string, nodes: TaskGraphNode[], priority: TaskPriority = 'medium') {
    const graphId = randomUUID();
    const redisClient = getRedis();

    // Find root nodes (no dependencies) and start them
    const rootNodes = nodes.filter(n => n.dependsOn.length === 0);
    if (nodes.length > 0 && rootNodes.length === 0) {
      throw new Error('Task graph has no root nodes. Verify that dependencies form a valid DAG.');
    }

    // Store graph state in Redis
    await redisClient.set(
      `taskgraph:${graphId}`,
      JSON.stringify({
        tenantId,
        nodes,
        completedTasks: [],
        failedTasks: [],
        dispatchedTasks: rootNodes.map((node) => node.taskId),
      } satisfies TaskGraphState),
      'EX',
      86400, // 24h TTL
    );

    const db = getDb();
    for (const node of rootNodes) {
      const agentType = TASK_TO_AGENT_MAP[node.type];
      if (!agentType) {
        console.error(`Unknown task type in graph: ${node.type}`);
        continue;
      }

      await db.insert(agentTasks).values({
        id: node.taskId,
        tenantId,
        type: node.type,
        priority,
        status: 'queued',
        input: node.input,
        dependsOn: node.dependsOn,
      });

      try {
        await publishAgentTask({
          id: node.taskId,
          tenantId,
          agentType,
          type: node.type,
          priority,
          input: { ...node.input, graphId },
        });
      } catch (error) {
        await db.update(agentTasks)
          .set({
            status: 'pending',
            error: error instanceof Error ? error.message : String(error),
            updatedAt: new Date(),
          })
          .where(eq(agentTasks.id, node.taskId));
      }
    }

    console.log(`Task graph ${graphId} started with ${rootNodes.length} root tasks out of ${nodes.length} total`);
    return graphId;
  }

  /**
   * Called when a task completes. Checks if any dependent tasks can now start.
   */
  async onTaskCompleted(result: { taskId: string; tenantId: string; output: any; graphId?: string }) {
    // Update task status
    const db = getDb();
    await db.update(agentTasks)
      .set({
        status: 'completed',
        output: result.output,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentTasks.id, result.taskId));

    // If this task is part of a graph, check for dependent tasks
    const graphId = result.graphId || (result.output as any)?.graphId;
    if (!graphId) {
      await dispatchQueuedTasksForTenant(result.tenantId);
      return;
    }

    const graphUpdate = await this.markTaskCompleted(graphId, result.taskId);
    if (!graphUpdate) {
      await dispatchQueuedTasksForTenant(result.tenantId);
      return;
    }

    const { graph, readyNodes, isComplete } = graphUpdate;

    // Start ready tasks
    for (const node of readyNodes) {
      const agentType = TASK_TO_AGENT_MAP[node.type];
      if (!agentType) continue;

      await db.insert(agentTasks).values({
        id: node.taskId,
        tenantId: graph.tenantId,
        type: node.type,
        priority: 'medium',
        status: 'queued',
        input: node.input,
        dependsOn: node.dependsOn,
      }).onConflictDoNothing();

      try {
        await publishAgentTask({
          id: node.taskId,
          tenantId: graph.tenantId,
          agentType,
          type: node.type,
          priority: 'medium',
          input: { ...node.input, graphId },
        });
      } catch (error) {
        await db.update(agentTasks)
          .set({
            status: 'pending',
            error: error instanceof Error ? error.message : String(error),
            updatedAt: new Date(),
          })
          .where(eq(agentTasks.id, node.taskId));
      }

      console.log(`Graph ${graphId}: started dependent task ${node.taskId} (${node.type})`);
    }

    if (isComplete) {
      console.log(`Task graph ${graphId} completed. Success: ${graph.completedTasks.length}, Failed: ${graph.failedTasks.length}`);
      await getRedis().del(`taskgraph:${graphId}`);
    }

    await dispatchQueuedTasksForTenant(graph.tenantId);
  }

  private async markTaskCompleted(
    graphId: string,
    taskId: string,
  ): Promise<{ graph: TaskGraphState; readyNodes: TaskGraphNode[]; isComplete: boolean } | null> {
    const key = `taskgraph:${graphId}`;
    const redisClient = getRedis();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this.clearWatch(redisClient);
      let isWatching = false;

      try {
        await redisClient.watch(key);
        isWatching = true;
        const raw = await redisClient.get(key);

        if (!raw) {
          return null;
        }

        let graph: TaskGraphState;
        try {
          graph = JSON.parse(raw) as TaskGraphState;
        } catch {
          isWatching = false;
          await this.clearWatch(redisClient);
          await redisClient.del(key);
          throw new Error(`Task graph ${graphId} is corrupted and could not be parsed`);
        }

        if (!graph.completedTasks.includes(taskId)) {
          graph.completedTasks.push(taskId);
        }

        const readyNodes = graph.nodes.filter((node) => {
          if (graph.completedTasks.includes(node.taskId)) return false;
          if (graph.failedTasks.includes(node.taskId)) return false;
          if (graph.dispatchedTasks.includes(node.taskId)) return false;
          return node.dependsOn.every((dep) => graph.completedTasks.includes(dep));
        });

        if (readyNodes.length > 0) {
          graph.dispatchedTasks = [...new Set([...graph.dispatchedTasks, ...readyNodes.map((node) => node.taskId)])];
        }

        const multi = redisClient.multi();
        multi.set(key, JSON.stringify(graph), 'EX', 86400);
        const execResult = await multi.exec();
        if (execResult) {
          isWatching = false;
          const isComplete = graph.completedTasks.length + graph.failedTasks.length === graph.nodes.length;
          return { graph, readyNodes, isComplete };
        }
      } finally {
        if (isWatching) {
          await this.clearWatch(redisClient);
        }
      }

      if (attempt < 4) {
        await this.waitForRetrySlot(attempt);
      }
    }

    throw new Error(`Failed to update task graph ${graphId} after multiple retries`);
  }

  private async clearWatch(redisClient: Redis): Promise<void> {
    await redisClient.unwatch().catch(() => undefined);
  }

  private async waitForRetrySlot(attempt: number): Promise<void> {
    const delayMs = Math.min(25 * (attempt + 1), 125);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Inject new nodes into a running task graph (Dynamic DAG Re-Wiring).
   * Used by the orchestrator to dynamically create new tasks in response
   * to signals (e.g., anomaly_escalated triggers creative + ad pivot tasks).
   *
   * Atomically appends nodes to the graph. Any nodes whose dependencies are
   * already satisfied will be dispatched immediately.
   */
  async injectNodes(
    graphId: string,
    tenantId: string,
    newNodes: TaskGraphNode[],
    priority: TaskPriority = 'high',
  ): Promise<{ injected: number; immediatelyReady: TaskGraphNode[] }> {
    const key = `taskgraph:${graphId}`;
    const redisClient = getRedis();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this.clearWatch(redisClient);
      let isWatching = false;

      try {
        await redisClient.watch(key);
        isWatching = true;
        const raw = await redisClient.get(key);

        if (!raw) {
          // Graph expired — create a new sub-graph with these nodes
          isWatching = false;
          await this.clearWatch(redisClient);
          const subGraphId = await this.executeGraph(tenantId, newNodes, priority);
          console.log(`Graph ${graphId} expired; created sub-graph ${subGraphId} with ${newNodes.length} injected nodes`);
          return { injected: newNodes.length, immediatelyReady: newNodes.filter(n => n.dependsOn.length === 0) };
        }

        let graph: TaskGraphState;
        try {
          graph = JSON.parse(raw) as TaskGraphState;
        } catch {
          isWatching = false;
          await this.clearWatch(redisClient);
          throw new Error(`Task graph ${graphId} is corrupted`);
        }

        // Append new nodes to the DAG
        graph.nodes.push(...newNodes);

        // Find nodes that are immediately ready (all deps already completed)
        const readyNodes = newNodes.filter((node) => {
          if (graph.dispatchedTasks.includes(node.taskId)) return false;
          return node.dependsOn.every((dep) => graph.completedTasks.includes(dep));
        });

        if (readyNodes.length > 0) {
          graph.dispatchedTasks = [...new Set([...graph.dispatchedTasks, ...readyNodes.map(n => n.taskId)])];
        }

        const multi = redisClient.multi();
        multi.set(key, JSON.stringify(graph), 'EX', 86400);
        const execResult = await multi.exec();

        if (execResult) {
          isWatching = false;

          // Dispatch immediately-ready nodes
          const db = getDb();
          for (const node of readyNodes) {
            const agentType = TASK_TO_AGENT_MAP[node.type];
            if (!agentType) continue;

            await db.insert(agentTasks).values({
              id: node.taskId,
              tenantId,
              type: node.type,
              priority,
              status: 'queued',
              input: node.input,
              dependsOn: node.dependsOn,
            }).onConflictDoNothing();

            try {
              await publishAgentTask({
                id: node.taskId,
                tenantId,
                agentType,
                type: node.type,
                priority,
                input: { ...node.input, graphId },
              });
            } catch (error) {
              await db.update(agentTasks)
                .set({
                  status: 'pending',
                  error: error instanceof Error ? error.message : String(error),
                  updatedAt: new Date(),
                })
                .where(eq(agentTasks.id, node.taskId));
            }
          }

          console.log(`Graph ${graphId}: injected ${newNodes.length} nodes, ${readyNodes.length} immediately dispatched`);
          return { injected: newNodes.length, immediatelyReady: readyNodes };
        }
      } finally {
        if (isWatching) {
          await this.clearWatch(redisClient);
        }
      }

      if (attempt < 4) {
        await this.waitForRetrySlot(attempt);
      }
    }

    throw new Error(`Failed to inject nodes into graph ${graphId} after multiple retries`);
  }
}
