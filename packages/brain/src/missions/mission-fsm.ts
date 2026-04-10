import { randomUUID } from 'node:crypto';
import { createLogger } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import type { Mission, MissionStatus, DynamicTaskPlan, PlannedTask } from '../types.js';

// ---------------------------------------------------------------------------
// Mission FSM — Phase 4.2
//
// Higher-order work units that span multiple tasks across multiple agents.
// Implements a finite state machine:
//
//   planning → dispatching → executing → reviewing → adjusting → completed
//                                           ↓
//                                      failed → diagnosing → re-planning
//
// Inspired by Agent Orchestrator's session lifecycle state machine.
// ---------------------------------------------------------------------------

const logger = createLogger('brain:mission-fsm');
const MISSIONS_KEY = (tenantId: string) => `brain:missions:${tenantId}`;
const MISSION_KEY = (tenantId: string, missionId: string) => `brain:mission:${tenantId}:${missionId}`;
const MISSION_TTL = 7 * 24 * 3_600; // 7 days

/** Valid state transitions */
const TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  planning: ['dispatching', 'failed'],
  dispatching: ['executing', 'failed'],
  executing: ['reviewing', 'failed'],
  reviewing: ['adjusting', 'completed', 'failed'],
  adjusting: ['dispatching', 'completed', 'failed'],
  completed: [],
  failed: ['diagnosing'],
  diagnosing: ['re-planning', 'completed'],
  're-planning': ['dispatching', 'failed'],
  cancelled: [],
};

export class MissionFSM {
  /** Create a new mission from a task plan */
  async createMission(
    tenantId: string,
    goal: string,
    plan: DynamicTaskPlan,
  ): Promise<Mission> {
    const mission: Mission = {
      id: randomUUID(),
      tenantId,
      goal,
      status: 'planning',
      taskPlan: plan,
      agentAssignments: this.extractAssignments(plan),
      outcomes: [],
      totalCost: 0,
      startedAt: new Date(),
    };

    await this.saveMission(tenantId, mission);
    await this.addToIndex(tenantId, mission.id);

    logger.info('Mission created', { tenantId, missionId: mission.id, goal });
    return mission;
  }

  /** Transition a mission to a new state */
  async transition(
    tenantId: string,
    missionId: string,
    newStatus: MissionStatus,
  ): Promise<Mission> {
    const mission = await this.getMission(tenantId, missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    const validNext = TRANSITIONS[mission.status];
    if (!validNext || !validNext.includes(newStatus)) {
      throw new Error(
        `Invalid transition: ${mission.status} → ${newStatus}. Valid: ${validNext?.join(', ') ?? 'none'}`,
      );
    }

    const previousStatus = mission.status;
    mission.status = newStatus;

    if (newStatus === 'completed' || newStatus === 'cancelled') {
      mission.completedAt = new Date();
    }

    await this.saveMission(tenantId, mission);

    logger.info('Mission state transition', {
      tenantId,
      missionId,
      from: previousStatus,
      to: newStatus,
    });

    return mission;
  }

  /** Record a task outcome for a mission */
  async recordOutcome(
    tenantId: string,
    missionId: string,
    outcome: {
      taskId: string;
      taskType: string;
      agentType: string;
      status: 'completed' | 'failed';
      durationMs: number;
      cost: number;
      result?: Record<string, unknown>;
    },
  ): Promise<void> {
    const mission = await this.getMission(tenantId, missionId);
    if (!mission) return;

    mission.outcomes.push(outcome);
    mission.totalCost += outcome.cost;

    // Check if all tasks in current plan are done
    const completedTasks = mission.outcomes.filter(o => o.status === 'completed').length;
    const failedTasks = mission.outcomes.filter(o => o.status === 'failed').length;
    const totalPlanned = mission.taskPlan.tasks.length;

    await this.saveMission(tenantId, mission);

    if (completedTasks + failedTasks >= totalPlanned) {
      if (failedTasks > 0 && failedTasks / totalPlanned > 0.5) {
        // More than half failed — transition to failed
        await this.transition(tenantId, missionId, 'failed');
      } else {
        // All done — transition to reviewing
        if (mission.status === 'executing') {
          await this.transition(tenantId, missionId, 'reviewing');
        }
      }
    }
  }

  /** Get a mission by ID */
  async getMission(tenantId: string, missionId: string): Promise<Mission | null> {
    const redis = getRedisConnection();
    const raw = await redis.get(MISSION_KEY(tenantId, missionId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as Mission;
    } catch {
      return null;
    }
  }

  /** Get all active missions for a tenant */
  async getActiveMissions(tenantId: string): Promise<Mission[]> {
    const redis = getRedisConnection();
    const indexKey = MISSIONS_KEY(tenantId);
    const missionIds = await redis.smembers(indexKey);

    const missions: Mission[] = [];
    for (const id of missionIds) {
      const mission = await this.getMission(tenantId, id);
      if (mission && mission.status !== 'completed' && mission.status !== 'cancelled') {
        missions.push(mission);
      }
    }

    return missions;
  }

  /** Cancel a mission */
  async cancel(tenantId: string, missionId: string): Promise<void> {
    const mission = await this.getMission(tenantId, missionId);
    if (!mission) return;

    mission.status = 'cancelled';
    mission.completedAt = new Date();
    await this.saveMission(tenantId, mission);

    logger.info('Mission cancelled', { tenantId, missionId });
  }

  private extractAssignments(plan: DynamicTaskPlan): Record<string, string[]> {
    const assignments: Record<string, string[]> = {};

    for (const task of plan.tasks) {
      if (!assignments[task.agentType]) {
        assignments[task.agentType] = [];
      }
      assignments[task.agentType]!.push(task.id);
    }

    return assignments;
  }

  private async saveMission(tenantId: string, mission: Mission): Promise<void> {
    const redis = getRedisConnection();
    await redis.setex(
      MISSION_KEY(tenantId, mission.id),
      MISSION_TTL,
      JSON.stringify(mission),
    );
  }

  private async addToIndex(tenantId: string, missionId: string): Promise<void> {
    const redis = getRedisConnection();
    const indexKey = MISSIONS_KEY(tenantId);
    await redis.sadd(indexKey, missionId);
    await redis.expire(indexKey, MISSION_TTL);
  }
}
