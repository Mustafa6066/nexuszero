import { AGENT_SIGNAL_SUBSCRIPTIONS } from '@nexuszero/queue';
import type { SignalType } from '@nexuszero/queue';
import { getRedisConnection } from '@nexuszero/queue';
import type { SignalImportanceScore } from '../types.js';

// ---------------------------------------------------------------------------
// Signal Graph Intelligence — Layer 1
//
// Builds a real-time dependency graph of which agents produce signals that
// other agents consume. Computes signal importance via network centrality.
//
// Inspired by Repowise's PageRank for code centrality — applied to
// inter-agent signal flows in the NexusZero swarm.
// ---------------------------------------------------------------------------

const CACHE_KEY = (tenantId: string) => `brain:intelligence:signal-graph:${tenantId}`;
const CACHE_TTL = 300; // 5 minutes
const KNOWN_SIGNAL_TYPES = new Set<SignalType>(Object.values(AGENT_SIGNAL_SUBSCRIPTIONS).flat());

/** Map of which agent types produce which signal types */
const AGENT_SIGNAL_PRODUCTION: Record<string, string[]> = {
  seo: ['seo.keyword_discovered', 'seo.content_published', 'seo.ranking_changed', 'seo.competitor_analyzed'],
  ad: ['ad.campaign_launched', 'ad.budget_alert', 'ad.performance_update', 'ad.creative_needed'],
  creative: ['creative.asset_generated', 'creative.test_completed', 'creative.fatigue_detected', 'creative.winner_found', 'creative.critic_evaluated'],
  'data-nexus': ['data.insight_generated', 'data.anomaly_detected', 'data.anomaly_escalated', 'data.forecast_updated', 'data.funnel_alert'],
  aeo: ['aeo.citation_found', 'aeo.visibility_changed', 'aeo.entity_updated', 'aeo.probe_completed'],
  geo: ['geo.ranking_dropped', 'geo.citation_audit_completed'],
  social: ['social.mention_detected', 'social.trend_detected', 'social.yt_outlier_found'],
  reddit: ['reddit.mention_detected', 'reddit.reply_posted'],
  'content-writer': ['content.expert_panel_scored', 'content.quality_gate_passed', 'content.quality_gate_failed'],
  compatibility: ['compatibility.integration_connected', 'compatibility.health_degraded', 'compatibility.schema_drift_detected'],
  'sales-pipeline': ['sales.lead_scored', 'sales.lead_suppressed', 'sales.deal_resurrected', 'sales.icp_updated'],
  outbound: ['outbound.campaign_scored', 'outbound.lead_verified', 'outbound.competitor_changed'],
  finance: ['finance.anomaly_detected', 'finance.report_generated'],
  podcast: ['podcast.episode_processed', 'podcast.content_generated'],
};

export interface SignalEdge {
  fromAgent: string;
  toAgent: string;
  signalType: SignalType;
  weight: number;
}

export interface SignalGraphSnapshot {
  edges: SignalEdge[];
  importanceScores: SignalImportanceScore[];
  agentCentrality: Record<string, number>;
  healthyPathways: number;
  dormantPathways: number;
  generatedAt: Date;
}

export class SignalGraphIntelligence {
  /** Build the full signal dependency graph and compute centrality scores */
  async analyze(tenantId: string): Promise<SignalGraphSnapshot> {
    const redis = getRedisConnection();
    const cached = await redis.get(CACHE_KEY(tenantId));
    if (cached) {
      try {
        return JSON.parse(cached) as SignalGraphSnapshot;
      } catch {
        // Rebuild
      }
    }

    const edges = this.buildEdges();
    const importanceScores = this.computeImportanceScores(edges);
    const agentCentrality = this.computeAgentCentrality(edges);
    const { healthy, dormant } = await this.assessPathwayHealth(tenantId, edges);

    const snapshot: SignalGraphSnapshot = {
      edges,
      importanceScores,
      agentCentrality,
      healthyPathways: healthy,
      dormantPathways: dormant,
      generatedAt: new Date(),
    };

    await redis.setex(CACHE_KEY(tenantId), CACHE_TTL, JSON.stringify(snapshot));

    return snapshot;
  }

  /** Build directed edges: producer agent → consumer agent via signal type */
  private buildEdges(): SignalEdge[] {
    const edges: SignalEdge[] = [];

    for (const [producerAgent, producedSignals] of Object.entries(AGENT_SIGNAL_PRODUCTION)) {
      for (const signalType of producedSignals) {
        if (!KNOWN_SIGNAL_TYPES.has(signalType as SignalType)) {
          continue;
        }

        const typedSignal = signalType as SignalType;
        for (const [consumerAgent, subscribedSignals] of Object.entries(AGENT_SIGNAL_SUBSCRIPTIONS)) {
          if (subscribedSignals.includes(typedSignal)) {
            edges.push({
              fromAgent: producerAgent,
              toAgent: consumerAgent,
              signalType: typedSignal,
              weight: 1,
            });
          }
        }
      }
    }

    return edges;
  }

  /**
   * Compute signal importance using simplified PageRank:
   * signals consumed by more agents are more central/important.
   */
  private computeImportanceScores(edges: SignalEdge[]): SignalImportanceScore[] {
    const signalConsumers = new Map<string, Set<string>>();

    for (const edge of edges) {
      if (!signalConsumers.has(edge.signalType)) {
        signalConsumers.set(edge.signalType, new Set());
      }
      signalConsumers.get(edge.signalType)!.add(edge.toAgent);
    }

    const maxConsumers = Math.max(
      ...[...signalConsumers.values()].map(s => s.size),
      1,
    );

    const scores: SignalImportanceScore[] = [];
    for (const [signalType, consumers] of signalConsumers) {
      scores.push({
        signalType: signalType as SignalType,
        importanceScore: consumers.size / maxConsumers,
        consumerCount: consumers.size,
        outcomeCorrelation: 0, // Requires historical data — populated by temporal analysis
      });
    }

    return scores.sort((a, b) => b.importanceScore - a.importanceScore);
  }

  /**
   * Compute agent centrality: how many edges (in + out) each agent has.
   * Agents with higher centrality are more critical to the swarm's functioning.
   */
  private computeAgentCentrality(edges: SignalEdge[]): Record<string, number> {
    const edgeCount = new Map<string, number>();

    for (const edge of edges) {
      edgeCount.set(edge.fromAgent, (edgeCount.get(edge.fromAgent) ?? 0) + 1);
      edgeCount.set(edge.toAgent, (edgeCount.get(edge.toAgent) ?? 0) + 1);
    }

    const maxEdges = Math.max(...edgeCount.values(), 1);
    const centrality: Record<string, number> = {};

    for (const [agent, count] of edgeCount) {
      centrality[agent] = count / maxEdges;
    }

    return centrality;
  }

  /** Check which signal pathways are active vs dormant for a tenant */
  private async assessPathwayHealth(
    tenantId: string,
    edges: SignalEdge[],
  ): Promise<{ healthy: number; dormant: number }> {
    const redis = getRedisConnection();
    let healthy = 0;
    let dormant = 0;

    // Check signal activity timestamps from Redis
    for (const edge of edges) {
      const key = `signal:last:${tenantId}:${edge.signalType}`;
      const lastSeen = await redis.get(key);

      if (lastSeen) {
        const age = Date.now() - parseInt(lastSeen, 10);
        if (age < 7 * 24 * 60 * 60 * 1000) {
          // Active within last 7 days
          healthy++;
        } else {
          dormant++;
        }
      } else {
        dormant++;
      }
    }

    return { healthy, dormant };
  }
}
