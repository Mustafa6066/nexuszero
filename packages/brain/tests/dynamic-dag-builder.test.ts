import { describe, expect, it } from 'vitest';
import { DynamicDagBuilder } from '../src/planning/dynamic-dag-builder.ts';
import type { OperatingPicture, ScoredOpportunity, AgentState } from '../src/types.ts';

function createOperatingPicture(agents: AgentState[]): OperatingPicture {
  return {
    tenantId: 'tenant-1',
    signals: {
      tenantId: 'tenant-1',
      signals: [],
      collectedAt: new Date('2025-01-01T00:00:00.000Z'),
      windowMs: 30_000,
    },
    fleet: {
      tenantId: 'tenant-1',
      agents,
      totalActiveJobs: 0,
      totalQueuedJobs: 0,
      fleetHealthScore: 0.9,
      collectedAt: new Date('2025-01-01T00:00:00.000Z'),
    },
    integrations: [],
    recentOutcomes: [],
    activeStrategies: [],
    kpiSnapshot: {},
    generatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}

function createAgent(agentType: string, activity: AgentState['activity']): AgentState {
  return {
    agentId: `${agentType}-1`,
    agentType,
    activity,
    activeJobs: 0,
    queueDepth: 0,
    healthScore: 0.95,
    lastHeartbeat: new Date('2025-01-01T00:00:00.000Z'),
    recentSuccessRate: 0.98,
    avgProcessingTimeMs: 1_000,
  };
}

function createOpportunity(overrides: Partial<ScoredOpportunity> = {}): ScoredOpportunity {
  return {
    id: 'opp-1',
    description: 'Attack a new keyword cluster',
    impactScore: 0.9,
    readinessScore: 0.8,
    riskScore: 0.2,
    compositeScore: 0.9,
    suggestedTaskType: 'keyword_research',
    suggestedAgentType: 'seo',
    reasoning: 'Strong upside with healthy content support',
    relatedSignals: ['seo.keyword_discovered'],
    ...overrides,
  };
}

describe('DynamicDagBuilder', () => {
  it('builds chained follow-up tasks when downstream agents are healthy', async () => {
    const builder = new DynamicDagBuilder();
    const opportunity = createOpportunity();
    const picture = createOperatingPicture([
      createAgent('seo', 'active'),
      createAgent('content-writer', 'active'),
    ]);

    const [plan] = await builder.buildPlans('tenant-1', [opportunity], picture);

    expect(plan).toBeDefined();
    expect(plan.tasks).toHaveLength(3);
    expect(plan.tasks[0]?.taskType).toBe('keyword_research');
    expect(plan.tasks[0]?.priority).toBe('critical');

    const rootTaskId = plan.tasks[0]!.id;
    expect(plan.tasks.slice(1).map((task) => task.taskType)).toEqual([
      'content_attack_brief',
      'write_blog_post',
    ]);
    expect(plan.tasks.slice(1).every((task) => task.dependsOn[0] === rootTaskId)).toBe(true);
    expect(plan.rollbackPlan).toHaveLength(3);
  });

  it('skips follow-up tasks when the required downstream agent is degraded', async () => {
    const builder = new DynamicDagBuilder();
    const opportunity = createOpportunity({
      id: 'opp-2',
      suggestedTaskType: 'generate_creative',
      suggestedAgentType: 'creative',
      compositeScore: 0.7,
    });
    const picture = createOperatingPicture([
      createAgent('creative', 'active'),
      createAgent('ad', 'degraded'),
    ]);

    const [plan] = await builder.buildPlans('tenant-1', [opportunity], picture);

    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]?.taskType).toBe('generate_creative');
    expect(plan.rollbackPlan).toEqual([
      {
        taskId: plan.tasks[0]!.id,
        action: 'archive_creative',
        description: 'Rollback generate_creative',
      },
    ]);
  });
});