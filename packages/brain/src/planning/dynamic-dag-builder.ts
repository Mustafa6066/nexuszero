import { randomUUID } from 'node:crypto';
import type {
  ScoredOpportunity,
  OperatingPicture,
  DynamicTaskPlan,
  PlannedTask,
  RollbackStep,
} from '../types.js';
import type { TaskPriority } from '@nexuszero/shared';

// ---------------------------------------------------------------------------
// Dynamic DAG Builder — Planning Layer
//
// Generates task DAGs dynamically based on current operating picture and
// scored opportunities. Unlike pre-defined workflows, the Brain decides
// what tasks to create and how to chain them based on real-time state.
// ---------------------------------------------------------------------------

/** Maximum tasks per plan to prevent runaway planning */
const MAX_TASKS_PER_PLAN = 10;

/** Task types that can logically chain into follow-up tasks */
const TASK_CHAINS: Record<string, { followUp: string; agentType: string; condition?: string }[]> = {
  seo_audit: [
    { followUp: 'content_optimization', agentType: 'seo', condition: 'findings.hasContentGaps' },
    { followUp: 'technical_seo_check', agentType: 'seo', condition: 'findings.hasTechnicalIssues' },
  ],
  keyword_research: [
    { followUp: 'content_attack_brief', agentType: 'seo' },
    { followUp: 'write_blog_post', agentType: 'content-writer' },
  ],
  investigate_anomaly: [
    { followUp: 'daily_analysis', agentType: 'data-nexus' },
    { followUp: 'cfo_briefing', agentType: 'finance', condition: 'severity === critical' },
  ],
  scan_citations: [
    { followUp: 'analyze_visibility', agentType: 'aeo' },
    { followUp: 'optimize_schema', agentType: 'aeo', condition: 'lowVisibility' },
  ],
  health_check: [
    { followUp: 'auto_reconnect', agentType: 'compatibility', condition: 'needsReconnect' },
  ],
  generate_creative: [
    { followUp: 'run_ab_test', agentType: 'ad' },
  ],
  geo_keyword_research: [
    { followUp: 'geo_rank_check', agentType: 'geo' },
    { followUp: 'write_blog_post', agentType: 'content-writer' },
  ],
  lead_score: [
    { followUp: 'sequence_build', agentType: 'outbound' },
  ],
  podcast_ingest: [
    { followUp: 'content_extract', agentType: 'podcast' },
    { followUp: 'content_generate', agentType: 'podcast' },
  ],
};

/** Map priority keyword to TaskPriority value */
function mapPriority(compositeScore: number): TaskPriority {
  if (compositeScore > 0.85) return 'critical';
  if (compositeScore > 0.65) return 'high';
  if (compositeScore > 0.4) return 'medium';
  return 'low';
}

export class DynamicDagBuilder {
  /**
   * Build dynamic task plans from scored opportunities.
   * Each high-scoring opportunity gets its own plan with potential follow-up chains.
   */
  async buildPlans(
    tenantId: string,
    opportunities: ScoredOpportunity[],
    picture: OperatingPicture,
  ): Promise<DynamicTaskPlan[]> {
    const plans: DynamicTaskPlan[] = [];

    for (const opportunity of opportunities) {
      const plan = this.buildPlanForOpportunity(tenantId, opportunity, picture);
      if (plan.tasks.length > 0) {
        plans.push(plan);
      }
    }

    return plans;
  }

  private buildPlanForOpportunity(
    tenantId: string,
    opportunity: ScoredOpportunity,
    picture: OperatingPicture,
  ): DynamicTaskPlan {
    const planId = randomUUID();
    const tasks: PlannedTask[] = [];
    const rollbackPlan: RollbackStep[] = [];

    // Root task from the opportunity
    const rootTask: PlannedTask = {
      id: randomUUID(),
      taskType: opportunity.suggestedTaskType,
      agentType: opportunity.suggestedAgentType,
      priority: mapPriority(opportunity.compositeScore),
      input: {
        triggeredBy: 'brain',
        opportunityId: opportunity.id,
        reasoning: opportunity.reasoning,
        relatedSignals: opportunity.relatedSignals,
      },
      dependsOn: [],
      rollbackAction: this.getRollbackAction(opportunity.suggestedTaskType),
    };
    tasks.push(rootTask);

    // Add rollback step for root
    rollbackPlan.push({
      taskId: rootTask.id,
      action: rootTask.rollbackAction ?? 'cancel',
      description: `Rollback ${opportunity.suggestedTaskType}`,
    });

    // Add follow-up chains based on task type
    const chains = TASK_CHAINS[opportunity.suggestedTaskType];
    if (chains && tasks.length < MAX_TASKS_PER_PLAN) {
      for (const chain of chains) {
        // Check if the target agent is available
        const targetAgent = picture.fleet.agents.find(a => a.agentType === chain.agentType);
        if (!targetAgent || targetAgent.activity === 'degraded' || targetAgent.activity === 'blocked') {
          continue;
        }

        const followUpTask: PlannedTask = {
          id: randomUUID(),
          taskType: chain.followUp,
          agentType: chain.agentType,
          priority: mapPriority(opportunity.compositeScore * 0.8), // Slightly lower priority for follow-ups
          input: {
            triggeredBy: 'brain',
            parentOpportunityId: opportunity.id,
            condition: chain.condition,
          },
          dependsOn: [rootTask.id],
          rollbackAction: this.getRollbackAction(chain.followUp),
        };
        tasks.push(followUpTask);

        rollbackPlan.push({
          taskId: followUpTask.id,
          action: followUpTask.rollbackAction ?? 'cancel',
          description: `Rollback follow-up ${chain.followUp}`,
        });

        if (tasks.length >= MAX_TASKS_PER_PLAN) break;
      }
    }

    const estimatedTotalMs = tasks.length * 30_000; // Rough estimate: 30s per task

    return {
      id: planId,
      tenantId,
      tasks,
      reasoning: `Plan generated from opportunity: ${opportunity.description} (score: ${opportunity.compositeScore.toFixed(2)})`,
      estimatedTotalDurationMs: estimatedTotalMs,
      rollbackPlan,
      createdAt: new Date(),
    };
  }

  private getRollbackAction(taskType: string): string {
    const rollbackMap: Record<string, string> = {
      manage_campaign: 'pause_campaign',
      optimize_bids: 'revert_bids',
      generate_creative: 'archive_creative',
      write_blog_post: 'unpublish_content',
      publish_content: 'unpublish_content',
      auto_reconnect: 'disconnect',
      sequence_build: 'pause_sequence',
    };
    return rollbackMap[taskType] ?? 'cancel';
  }
}
