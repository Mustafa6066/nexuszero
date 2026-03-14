/**
 * Layer 3 — Behavioral Intelligence
 *
 * Learns from the customer's interaction patterns with the platform
 * and the assistant: tool usage frequency, conversation topics,
 * engagement cadence, skill-level signals, and pain points.
 */

import {
  withTenantDb,
  assistantMessages,
  assistantSessions,
  auditLogs,
} from '@nexuszero/db';
import { eq, and, desc, gte, sql, count } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────────────

export type EngagementLevel = 'dormant' | 'low' | 'moderate' | 'high' | 'power_user';
export type SkillLevel = 'beginner' | 'intermediate' | 'expert';

export interface ToolUsageStat {
  tool: string;
  count: number;
}

export interface BehavioralIntelligence {
  /** How engaged the customer is with the assistant */
  engagementLevel: EngagementLevel;
  /** Inferred skill level based on tool usage complexity */
  skillLevel: SkillLevel;
  /** Total assistant sessions in the last 30 days */
  recentSessions: number;
  /** Total assistant messages in the last 30 days */
  recentMessages: number;
  /** Average messages per session */
  avgMessagesPerSession: number;
  /** Top tools invoked through the assistant (last 30 days) */
  topTools: ToolUsageStat[];
  /** Most frequent dashboard actions from audit log (last 30 days) */
  topActions: ToolUsageStat[];
  /** Recent conversational focus areas derived from tool usage */
  focusAreas: string[];
  /** Detected pain points (repeated errors, retries, same questions) */
  painPoints: string[];
  /** Preferred interaction time (morning, afternoon, evening, night) */
  preferredTime: string | null;
  /** Average response latency experienced (ms) */
  avgLatencyMs: number;
}

// ── Builder ────────────────────────────────────────────────────────────────

export async function buildBehavioralIntelligence(
  tenantId: string,
  userId: string,
): Promise<BehavioralIntelligence> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return withTenantDb(tenantId, async (db) => {
    const [sessionStats, msgStats, toolUsage, actionUsage, timeDistribution] =
      await Promise.all([
        // Recent session count
        db.select({
          cnt: count(),
          avgMsgs: sql<number>`coalesce(avg(message_count), 0)::real`,
        })
          .from(assistantSessions)
          .where(
            and(
              eq(assistantSessions.tenantId, tenantId),
              eq(assistantSessions.userId, userId),
              gte(assistantSessions.lastMessageAt, since30d),
            ),
          )
          .then((r) => r[0]),

        // Recent messages & latency
        db.select({
          cnt: count(),
          avgLatency: sql<number>`coalesce(avg(latency_ms) filter (where role = 'assistant'), 0)::int`,
        })
          .from(assistantMessages)
          .where(
            and(
              eq(assistantMessages.tenantId, tenantId),
              gte(assistantMessages.createdAt, since30d),
            ),
          )
          .then((r) => r[0]),

        // Tool invocations extracted from JSONB tool_calls on assistant messages
        db.select({
          tool: sql<string>`tool_elem->>'tool'`,
          cnt: sql<number>`count(*)::int`,
        })
          .from(assistantMessages)
          .where(
            and(
              eq(assistantMessages.tenantId, tenantId),
              eq(assistantMessages.role, 'assistant' as never),
              gte(assistantMessages.createdAt, since30d),
              sql`jsonb_typeof(tool_calls) = 'array' and tool_calls != '[]'::jsonb`,
            ),
          )
          .innerJoin(
            sql`jsonb_array_elements(case when jsonb_typeof(${assistantMessages.toolCalls}) = 'array' then ${assistantMessages.toolCalls} else '[]'::jsonb end) as tool_elem` as never,
            sql`true`,
          )
          .groupBy(sql`tool_elem->>'tool'`)
          .orderBy(sql`count(*) desc`)
          .limit(10) as unknown as Promise<{ tool: string; cnt: number }[]>,

        // Top dashboard actions from audit_logs
        db.select({
          action: auditLogs.action,
          cnt: sql<number>`count(*)::int`,
        })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.tenantId, tenantId),
              gte(auditLogs.createdAt, since30d),
            ),
          )
          .groupBy(auditLogs.action)
          .orderBy(sql`count(*) desc`)
          .limit(8) as unknown as Promise<{ action: string; cnt: number }[]>,

        // Time-of-day distribution (hour buckets)
        db.select({
          bucket: sql<string>`case
            when extract(hour from created_at) between 5 and 11 then 'morning'
            when extract(hour from created_at) between 12 and 16 then 'afternoon'
            when extract(hour from created_at) between 17 and 20 then 'evening'
            else 'night' end`,
          cnt: sql<number>`count(*)::int`,
        })
          .from(assistantMessages)
          .where(
            and(
              eq(assistantMessages.tenantId, tenantId),
              gte(assistantMessages.createdAt, since30d),
            ),
          )
          .groupBy(sql`1`)
          .orderBy(sql`count(*) desc`)
          .limit(1) as unknown as Promise<{ bucket: string; cnt: number }[]>,
      ]);

    const recentSessions = Number(sessionStats?.cnt ?? 0);
    const avgMessagesPerSession = Number(sessionStats?.avgMsgs ?? 0);
    const recentMessages = Number(msgStats?.cnt ?? 0);
    const avgLatencyMs = Number(msgStats?.avgLatency ?? 0);

    const topTools: ToolUsageStat[] = (toolUsage ?? []).map((r) => ({
      tool: r.tool,
      count: Number(r.cnt),
    }));

    const topActions: ToolUsageStat[] = (actionUsage ?? []).map((r) => ({
      tool: r.action,
      count: Number(r.cnt),
    }));

    const preferredTime = timeDistribution?.[0]?.bucket ?? null;

    return {
      engagementLevel: assessEngagement(recentSessions, recentMessages),
      skillLevel: assessSkill(topTools),
      recentSessions,
      recentMessages,
      avgMessagesPerSession: Math.round(avgMessagesPerSession * 10) / 10,
      topTools,
      topActions,
      focusAreas: deriveFocusAreas(topTools),
      painPoints: derivePainPoints(topTools, topActions, recentSessions),
      preferredTime,
      avgLatencyMs,
    };
  });
}

// ── Private helpers ────────────────────────────────────────────────────────

function assessEngagement(sessions: number, messages: number): EngagementLevel {
  if (sessions === 0 && messages === 0) return 'dormant';
  if (sessions >= 15 || messages >= 60) return 'power_user';
  if (sessions >= 8 || messages >= 30) return 'high';
  if (sessions >= 3 || messages >= 10) return 'moderate';
  return 'low';
}

const ADVANCED_TOOLS = new Set([
  'generateReport', 'triggerAeoScan', 'adjustBudget',
  'getFunnelData', 'showChart', 'connectIntegration',
]);

const BASIC_TOOLS = new Set([
  'navigate', 'getAnalytics', 'getCampaigns', 'getCreatives',
  'explainMetric', 'explainAgent',
]);

function assessSkill(topTools: ToolUsageStat[]): SkillLevel {
  const usedAdvanced = topTools.filter((t) => ADVANCED_TOOLS.has(t.tool));
  const totalToolUse = topTools.reduce((s, t) => s + t.count, 0);

  if (usedAdvanced.length >= 3 || totalToolUse >= 40) return 'expert';
  if (usedAdvanced.length >= 1 || totalToolUse >= 15) return 'intermediate';
  return 'beginner';
}

const TOOL_TO_FOCUS: Record<string, string> = {
  getAnalytics: 'Performance analytics',
  getCampaigns: 'Campaign management',
  getCreatives: 'Creative assets',
  getSeoRankings: 'SEO & organic search',
  getAeoCitations: 'AI visibility (AEO)',
  getFunnelData: 'Funnel optimization',
  getAgentStatus: 'AI agent monitoring',
  getIntegrationHealth: 'Integration health',
  generateCreative: 'Creative generation',
  createCampaign: 'Campaign creation',
  generateReport: 'Reporting',
  showChart: 'Data visualization',
  adjustBudget: 'Budget optimization',
};

function deriveFocusAreas(topTools: ToolUsageStat[]): string[] {
  const areas = new Set<string>();
  for (const t of topTools.slice(0, 5)) {
    const area = TOOL_TO_FOCUS[t.tool];
    if (area) areas.add(area);
  }
  return [...areas].slice(0, 4);
}

function derivePainPoints(
  tools: ToolUsageStat[],
  actions: ToolUsageStat[],
  sessions: number,
): string[] {
  const points: string[] = [];

  // If user keeps checking integration health, they may have integration issues
  const healthChecks = tools.find((t) => t.tool === 'getIntegrationHealth');
  if (healthChecks && healthChecks.count >= 5) {
    points.push('Frequent integration health checks — may be experiencing connectivity issues');
  }

  // If explaining metrics repeatedly, they may need simpler reporting
  const explainCount = tools
    .filter((t) => t.tool === 'explainMetric' || t.tool === 'explainAgent')
    .reduce((s, t) => s + t.count, 0);
  if (explainCount >= 4) {
    points.push('Frequently asks for metric explanations — may benefit from guided analytics');
  }

  // High sessions but low tool use suggests they're struggling to find what they need
  const totalToolUse = tools.reduce((s, t) => s + t.count, 0);
  if (sessions >= 8 && totalToolUse < 5) {
    points.push('Many sessions with few tool actions — may need clearer guidance on capabilities');
  }

  return points;
}
