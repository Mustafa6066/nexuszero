import { randomUUID } from 'node:crypto';
import { AGENT_SIGNAL_SUBSCRIPTIONS } from '@nexuszero/queue';
import type { SignalType } from '@nexuszero/queue';
import type { OperatingPicture, ScoredOpportunity } from '../types.js';

// ---------------------------------------------------------------------------
// Priority Scorer — Reasoning Engine
//
// Scores pending opportunities by impact × readiness × risk. Uses signal
// importance from the signal graph and fleet state to produce an ordered
// list of actionable opportunities.
//
// Inspired by Repowise's PageRank for code centrality — applied here as
// signal importance scoring for cross-agent signal flows.
// ---------------------------------------------------------------------------

/** Weight factors for composite scoring */
const WEIGHTS = {
  impact: 0.4,
  readiness: 0.35,
  risk: 0.25,
} as const;

/** Signal types that indicate actionable opportunities */
const OPPORTUNITY_SIGNALS: Record<string, { taskType: string; agentType: string; baseImpact: number }> = {
  'seo.keyword_discovered': { taskType: 'content_optimization', agentType: 'seo', baseImpact: 0.6 },
  'seo.ranking_changed': { taskType: 'seo_audit', agentType: 'seo', baseImpact: 0.7 },
  'ad.budget_alert': { taskType: 'optimize_bids', agentType: 'ad', baseImpact: 0.9 },
  'ad.creative_needed': { taskType: 'generate_creative', agentType: 'creative', baseImpact: 0.7 },
  'creative.fatigue_detected': { taskType: 'generate_creative', agentType: 'creative', baseImpact: 0.8 },
  'data.anomaly_detected': { taskType: 'investigate_anomaly', agentType: 'data-nexus', baseImpact: 0.85 },
  'data.anomaly_escalated': { taskType: 'investigate_anomaly', agentType: 'data-nexus', baseImpact: 0.95 },
  'data.funnel_alert': { taskType: 'daily_analysis', agentType: 'data-nexus', baseImpact: 0.8 },
  'aeo.visibility_changed': { taskType: 'analyze_visibility', agentType: 'aeo', baseImpact: 0.65 },
  'geo.ranking_dropped': { taskType: 'geo_rank_check', agentType: 'geo', baseImpact: 0.7 },
  'compatibility.health_degraded': { taskType: 'health_check', agentType: 'compatibility', baseImpact: 0.9 },
  'compatibility.schema_drift_detected': { taskType: 'drift_detection', agentType: 'compatibility', baseImpact: 0.75 },
  'social.mention_detected': { taskType: 'draft_social_reply', agentType: 'social', baseImpact: 0.5 },
  'reddit.mention_detected': { taskType: 'draft_reply', agentType: 'reddit', baseImpact: 0.5 },
  'content.quality_gate_failed': { taskType: 'write_blog_post', agentType: 'content-writer', baseImpact: 0.6 },
  'finance.anomaly_detected': { taskType: 'cfo_briefing', agentType: 'finance', baseImpact: 0.8 },
};

export class PriorityScorer {
  /** Score all pending signal-driven opportunities for a tenant */
  async score(tenantId: string, picture: OperatingPicture): Promise<ScoredOpportunity[]> {
    const opportunities: ScoredOpportunity[] = [];

    // Compute signal importance scores (simplified PageRank-style)
    const signalImportance = this.computeSignalImportance();

    for (const signal of picture.signals.signals) {
      const opConfig = OPPORTUNITY_SIGNALS[signal.type];
      if (!opConfig) continue;

      const agentState = picture.fleet.agents.find(a => a.agentType === opConfig.agentType);

      const impact = this.computeImpact(opConfig.baseImpact, signal.confidence, signalImportance.get(signal.type) ?? 1);
      const readiness = this.computeReadiness(agentState, picture);
      const risk = this.computeRisk(signal, picture);
      const compositeScore = WEIGHTS.impact * impact + WEIGHTS.readiness * readiness + WEIGHTS.risk * (1 - risk);

      opportunities.push({
        id: randomUUID(),
        description: `${signal.type} → ${opConfig.taskType}`,
        impactScore: impact,
        readinessScore: readiness,
        riskScore: risk,
        compositeScore: Math.max(0, Math.min(1, compositeScore)),
        suggestedTaskType: opConfig.taskType,
        suggestedAgentType: opConfig.agentType,
        reasoning: this.generateReasoning(signal.type, impact, readiness, risk),
        relatedSignals: [signal.id],
      });
    }

    // Also score opportunities from degraded state (not signal-driven)
    const degradedOpportunities = this.scoreFleetDegradation(picture);
    opportunities.push(...degradedOpportunities);

    // Sort by composite score descending
    opportunities.sort((a, b) => b.compositeScore - a.compositeScore);

    return opportunities;
  }

  /**
   * Compute signal importance using consumer count as a proxy for centrality.
   * Signals consumed by more agents are more "central" to the system.
   * Inspired by Repowise's PageRank for code centrality.
   */
  private computeSignalImportance(): Map<string, number> {
    const importance = new Map<string, number>();
    const consumerCounts = new Map<string, number>();

    // Count how many agents subscribe to each signal type
    for (const subscriptions of Object.values(AGENT_SIGNAL_SUBSCRIPTIONS)) {
      for (const signalType of subscriptions) {
        consumerCounts.set(signalType, (consumerCounts.get(signalType) ?? 0) + 1);
      }
    }

    // Normalize to 0-1 range
    const maxConsumers = Math.max(...consumerCounts.values(), 1);
    for (const [signalType, count] of consumerCounts) {
      importance.set(signalType, count / maxConsumers);
    }

    return importance;
  }

  private computeImpact(baseImpact: number, confidence: number, signalImportance: number): number {
    return baseImpact * confidence * (0.5 + 0.5 * signalImportance);
  }

  private computeReadiness(
    agentState: { activity: string; healthScore: number; queueDepth: number } | undefined,
    picture: OperatingPicture,
  ): number {
    if (!agentState) return 0.3; // Agent not present — low readiness

    let readiness = agentState.healthScore;

    // Penalize if agent is already overloaded
    if (agentState.queueDepth > 10) readiness *= 0.5;
    else if (agentState.queueDepth > 5) readiness *= 0.7;

    // Penalize if agent is degraded or blocked
    if (agentState.activity === 'degraded') readiness *= 0.3;
    if (agentState.activity === 'blocked') readiness *= 0.1;

    // Boost if fleet health is high overall
    readiness *= 0.7 + 0.3 * picture.fleet.fleetHealthScore;

    return Math.max(0, Math.min(1, readiness));
  }

  private computeRisk(
    signal: { type: string; priority: string },
    picture: OperatingPicture,
  ): number {
    let risk = 0.3; // Base risk

    // Higher priority signals indicate higher risk situations
    if (signal.priority === 'critical') risk = 0.9;
    else if (signal.priority === 'high') risk = 0.6;

    // More integrations in error state = higher risk
    const degradedIntegrations = picture.integrations.filter(i => i.status !== 'healthy').length;
    risk += degradedIntegrations * 0.05;

    // Recent failures increase risk
    const recentFailures = picture.recentOutcomes.filter(o => o.status === 'failed').length;
    risk += recentFailures * 0.02;

    return Math.max(0, Math.min(1, risk));
  }

  private scoreFleetDegradation(picture: OperatingPicture): ScoredOpportunity[] {
    const opportunities: ScoredOpportunity[] = [];

    for (const agent of picture.fleet.agents) {
      if (agent.activity === 'degraded') {
        opportunities.push({
          id: randomUUID(),
          description: `Agent ${agent.agentType} is degraded — investigate`,
          impactScore: 0.8,
          readinessScore: 0.9,
          riskScore: 0.7,
          compositeScore: 0.65,
          suggestedTaskType: 'health_check',
          suggestedAgentType: 'compatibility',
          reasoning: `Agent ${agent.agentType} health score is ${agent.healthScore.toFixed(2)}, activity: ${agent.activity}`,
          relatedSignals: [],
        });
      }
    }

    return opportunities;
  }

  private generateReasoning(signalType: string, impact: number, readiness: number, risk: number): string {
    return `Signal ${signalType}: impact=${impact.toFixed(2)}, readiness=${readiness.toFixed(2)}, risk=${risk.toFixed(2)}`;
  }
}
