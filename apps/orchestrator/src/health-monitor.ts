import { getDb, agents } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';

interface AgentHealthStatus {
  agentId: string;
  tenantId: string;
  type: string;
  status: string;
  lastHeartbeat: Date | null;
  isHealthy: boolean;
  activeJobs: number;
}

export class HealthMonitor {
  private interval: ReturnType<typeof setInterval> | null = null;

  start() {
    // Check every 30 seconds
    this.interval = setInterval(() => this.checkHealth(), 30_000);
    console.log('Health monitor started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async getAllAgentStatus(): Promise<AgentHealthStatus[]> {
    const db = getDb();
    const allAgents = await db.select().from(agents);

    if (allAgents.length === 0) return [];

    const now = Date.now();
    const staleThresholdMs = 5 * 60 * 1000;

    return allAgents.map((agent) => {
      const heartbeatMs = agent.lastHeartbeat ? new Date(agent.lastHeartbeat).getTime() : 0;
      const hasHeartbeat = heartbeatMs > 0;
      const isHealthy =
        agent.status !== 'error' &&
        (!hasHeartbeat || now - heartbeatMs < staleThresholdMs);

      return {
        agentId: agent.id,
        tenantId: agent.tenantId,
        type: agent.type,
        status: agent.status,
        lastHeartbeat: agent.lastHeartbeat,
        isHealthy,
        activeJobs: agent.currentTaskId ? 1 : 0,
      };
    });
  }

  private async checkHealth() {
    const db = getDb();
    const allAgents = await db.select().from(agents)
      .where(and(
        eq(agents.status, 'processing'),
      ));

    const staleThreshold = Date.now() - 5 * 60 * 1000;

    for (const agent of allAgents) {
      const beatTime = agent.lastHeartbeat ? new Date(agent.lastHeartbeat).getTime() : 0;

      if (beatTime > 0 && beatTime < staleThreshold) {
        console.warn(`Agent ${agent.id} (${agent.type}) is unresponsive`);
        await db.update(agents)
          .set({ status: 'error', currentTaskId: null, updatedAt: new Date() })
          .where(eq(agents.id, agent.id));
      }
    }

    const recoveredAgents = await db.select().from(agents).where(eq(agents.status, 'error'));
    for (const agent of recoveredAgents) {
      const beatTime = agent.lastHeartbeat ? new Date(agent.lastHeartbeat).getTime() : 0;
      if (beatTime > 0 && beatTime >= staleThreshold) {
        await db.update(agents)
          .set({
            status: agent.currentTaskId ? 'processing' : 'idle',
            updatedAt: new Date(),
          })
          .where(eq(agents.id, agent.id));
      }
    }
  }
}
