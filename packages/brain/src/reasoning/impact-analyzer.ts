import { AGENT_SIGNAL_SUBSCRIPTIONS } from '@nexuszero/queue';
import type { OperatingPicture, BlastRadiusResult } from '../types.js';

// ---------------------------------------------------------------------------
// Impact Analyzer — Reasoning Engine
//
// Before executing high-risk actions, compute the blast radius: which agents,
// campaigns, and integrations will be affected transitively.
//
// Inspired by Repowise's PRBlastRadiusAnalyzer — adapted for agent swarm
// operations instead of code change analysis.
// ---------------------------------------------------------------------------

/** Maps task types to the signal types they produce */
const TASK_SIGNAL_PRODUCTION: Record<string, string[]> = {
  seo_audit: ['seo.ranking_changed', 'seo.keyword_discovered'],
  keyword_research: ['seo.keyword_discovered'],
  content_optimization: ['seo.content_published'],
  optimize_bids: ['ad.performance_update'],
  manage_campaign: ['ad.campaign_launched', 'ad.budget_alert'],
  generate_creative: ['creative.asset_generated'],
  investigate_anomaly: ['data.insight_generated'],
  daily_analysis: ['data.insight_generated', 'data.anomaly_detected'],
  forecast: ['data.forecast_updated'],
  scan_citations: ['aeo.citation_found'],
  analyze_visibility: ['aeo.visibility_changed'],
  health_check: ['compatibility.health_degraded'],
  write_blog_post: ['seo.content_published'],
  draft_social_reply: ['social.mention_detected'],
  draft_reply: ['reddit.reply_posted'],
  geo_rank_check: ['geo.ranking_dropped'],
};

export class ImpactAnalyzer {
  /**
   * Analyze the blast radius of executing a particular task type.
   * Computes which agents are directly and transitively affected via signal chains.
   */
  async analyze(
    taskType: string,
    tenantId: string,
    picture: OperatingPicture,
  ): Promise<BlastRadiusResult> {
    const producedSignals = TASK_SIGNAL_PRODUCTION[taskType] ?? [];

    // Direct impact: agents that subscribe to signals this task produces
    const directlyAffected = new Set<string>();
    for (const signalType of producedSignals) {
      for (const [agentType, subscriptions] of Object.entries(AGENT_SIGNAL_SUBSCRIPTIONS)) {
        if (subscriptions.includes(signalType as never)) {
          directlyAffected.add(agentType);
        }
      }
    }

    // Transitive impact: agents that subscribe to signals produced by directly-affected agents
    const transitivelyAffected = new Set<string>();
    for (const affectedAgent of directlyAffected) {
      // Find which task types this agent primarily produces
      const agentSignals = this.getSignalsProducedByAgent(affectedAgent);
      for (const sig of agentSignals) {
        for (const [agentType, subscriptions] of Object.entries(AGENT_SIGNAL_SUBSCRIPTIONS)) {
          if (subscriptions.includes(sig as never) && !directlyAffected.has(agentType)) {
            transitivelyAffected.add(agentType);
          }
        }
      }
    }

    // Risk assessment based on blast radius size and affected agent health
    const totalAffected = directlyAffected.size + transitivelyAffected.size;
    const affectedAgentHealth = this.computeAffectedHealth(
      [...directlyAffected, ...transitivelyAffected],
      picture,
    );

    const riskLevel = this.assessRisk(totalAffected, affectedAgentHealth, picture);
    const precautions = this.recommendPrecautions(taskType, riskLevel, directlyAffected, picture);

    return {
      taskType,
      directlyAffected: [...directlyAffected],
      transitivelyAffected: [...transitivelyAffected],
      riskLevel,
      recommendedPrecautions: precautions,
    };
  }

  private getSignalsProducedByAgent(agentType: string): string[] {
    const signalsByAgent: Record<string, string[]> = {
      seo: ['seo.keyword_discovered', 'seo.content_published', 'seo.ranking_changed', 'seo.competitor_analyzed'],
      ad: ['ad.campaign_launched', 'ad.budget_alert', 'ad.performance_update', 'ad.creative_needed'],
      creative: ['creative.asset_generated', 'creative.test_completed', 'creative.fatigue_detected', 'creative.winner_found'],
      'data-nexus': ['data.insight_generated', 'data.anomaly_detected', 'data.forecast_updated', 'data.funnel_alert'],
      aeo: ['aeo.citation_found', 'aeo.visibility_changed', 'aeo.entity_updated'],
      geo: ['geo.ranking_dropped', 'geo.citation_audit_completed'],
      social: ['social.mention_detected', 'social.trend_detected'],
      reddit: ['reddit.mention_detected', 'reddit.reply_posted'],
      'content-writer': ['content.quality_gate_passed', 'content.quality_gate_failed'],
      compatibility: ['compatibility.integration_connected', 'compatibility.health_degraded'],
      'sales-pipeline': ['sales.lead_scored', 'sales.deal_resurrected', 'sales.icp_updated'],
      outbound: ['outbound.campaign_scored', 'outbound.lead_verified', 'outbound.competitor_changed'],
      finance: ['finance.anomaly_detected', 'finance.report_generated'],
      podcast: ['podcast.episode_processed', 'podcast.content_generated'],
    };
    return signalsByAgent[agentType] ?? [];
  }

  private computeAffectedHealth(agentTypes: string[], picture: OperatingPicture): number {
    if (agentTypes.length === 0) return 1;

    const healthScores = agentTypes
      .map(type => picture.fleet.agents.find(a => a.agentType === type))
      .filter(Boolean)
      .map(a => a!.healthScore);

    if (healthScores.length === 0) return 0.5;
    return healthScores.reduce((sum, h) => sum + h, 0) / healthScores.length;
  }

  private assessRisk(
    totalAffected: number,
    affectedHealth: number,
    picture: OperatingPicture,
  ): BlastRadiusResult['riskLevel'] {
    // Scoring: more affected agents + lower health = higher risk
    const blastScore = totalAffected / Object.keys(AGENT_SIGNAL_SUBSCRIPTIONS).length;
    const healthRisk = 1 - affectedHealth;
    const recentFailureRate = picture.recentOutcomes.length > 0
      ? picture.recentOutcomes.filter(o => o.status === 'failed').length / picture.recentOutcomes.length
      : 0;

    const riskScore = blastScore * 0.4 + healthRisk * 0.4 + recentFailureRate * 0.2;

    if (riskScore > 0.7) return 'critical';
    if (riskScore > 0.5) return 'high';
    if (riskScore > 0.3) return 'medium';
    return 'low';
  }

  private recommendPrecautions(
    taskType: string,
    riskLevel: BlastRadiusResult['riskLevel'],
    directlyAffected: Set<string>,
    picture: OperatingPicture,
  ): string[] {
    const precautions: string[] = [];

    if (riskLevel === 'critical' || riskLevel === 'high') {
      precautions.push('Route through approval queue before execution');
      precautions.push(`Notify managers: ${directlyAffected.size} agents directly affected`);
    }

    if (riskLevel === 'critical') {
      precautions.push('Create rollback plan before execution');
      precautions.push('Snapshot current state for recovery');
    }

    // Check specific degraded agents in blast radius
    for (const agentType of directlyAffected) {
      const agent = picture.fleet.agents.find(a => a.agentType === agentType);
      if (agent && agent.activity === 'degraded') {
        precautions.push(`Wait for ${agentType} recovery before executing (currently degraded)`);
      }
    }

    return precautions;
  }
}
