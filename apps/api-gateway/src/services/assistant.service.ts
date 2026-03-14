import { randomUUID } from 'node:crypto';
import {
  withTenantDb,
  tenants,
  campaigns,
  agents,
  integrations,
  integrationHealth,
  analyticsDataPoints,
  creatives,
  funnelAnalysis,
  aeoCitations,
  assistantSessions,
  assistantMessages,
} from '@nexuszero/db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import type {
  SubscriptionTier,
  AssistantToolName,
  ToolCall,
  UIContext,
  AssistantStreamEvent,
} from '@nexuszero/shared';
import {
  buildCreativeLanguageInstruction,
  resolveMarketContext,
  TIER_CAPABILITIES,
  TIER_DISPLAY_NAMES,
  getRequiredTier,
} from '@nexuszero/shared';
import { gateTool } from './tier-gate.service.js';
import { buildCustomerIntelligence, renderIntelligencePrompt } from './intelligence/index.js';

// ── Claude API configuration ───────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// ── Tool definitions for Claude ────────────────────────────────────────────
interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

function buildToolDefinitions(tier: SubscriptionTier): ClaudeTool[] {
  const allowed = TIER_CAPABILITIES[tier].assistantTools;
  const allTools: ClaudeTool[] = [
    // Navigation
    { name: 'navigate', description: 'Navigate to a dashboard page', input_schema: { type: 'object', properties: { page: { type: 'string', description: 'Path like /dashboard/campaigns, /dashboard/analytics, /dashboard/agents, /dashboard/creatives, /dashboard/aeo, /dashboard/integrations, /dashboard/settings, /dashboard/webhooks' } }, required: ['page'] } },
    { name: 'openModal', description: 'Open a modal dialog', input_schema: { type: 'object', properties: { modalId: { type: 'string' }, data: { type: 'object' } }, required: ['modalId'] } },
    { name: 'closeModal', description: 'Close the current modal', input_schema: { type: 'object', properties: {} } },
    { name: 'setDateRange', description: 'Set the analytics date range', input_schema: { type: 'object', properties: { start: { type: 'string', description: 'ISO date string' }, end: { type: 'string', description: 'ISO date string' } }, required: ['start', 'end'] } },
    { name: 'setFilter', description: 'Apply a filter on the current page', input_schema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] } },
    // Data retrieval
    { name: 'getAnalytics', description: 'Fetch analytics data for a metric over a date range', input_schema: { type: 'object', properties: { metric: { type: 'string', enum: ['ad_performance', 'seo_traffic', 'conversions', 'revenue', 'impressions'] }, days: { type: 'number', description: 'Number of days to look back (default 30)' } }, required: ['metric'] } },
    { name: 'getCampaigns', description: 'List campaigns with optional filters', input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['draft', 'active', 'paused', 'completed'] }, type: { type: 'string' }, limit: { type: 'number' } } } },
    { name: 'getCreatives', description: 'List creative assets', input_schema: { type: 'object', properties: { limit: { type: 'number' } } } },
    { name: 'getAgentStatus', description: 'Get the health and status of all AI agents', input_schema: { type: 'object', properties: {} } },
    { name: 'getIntegrationHealth', description: 'Get health scores of all connected integrations', input_schema: { type: 'object', properties: {} } },
    { name: 'getSeoRankings', description: 'Get keyword ranking data', input_schema: { type: 'object', properties: { keywords: { type: 'array', items: { type: 'string' } } } } },
    { name: 'getAeoCitations', description: 'Get AI Engine Optimization citation data', input_schema: { type: 'object', properties: { platform: { type: 'string' } } } },
    { name: 'getFunnelData', description: 'Get funnel analysis data', input_schema: { type: 'object', properties: { days: { type: 'number' } } } },
    // Actions
    { name: 'createCampaign', description: 'Create a new marketing campaign', input_schema: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', enum: ['seo', 'ppc', 'social', 'display', 'video', 'email'] }, platform: { type: 'string', enum: ['google_ads', 'meta_ads', 'linkedin_ads'] }, dailyBudget: { type: 'number' }, targetAudience: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } } }, required: ['name', 'type'] } },
    { name: 'generateCreative', description: 'Generate an ad creative', input_schema: { type: 'object', properties: { format: { type: 'string' }, headline: { type: 'string' }, description: { type: 'string' }, platform: { type: 'string' } }, required: ['format'] } },
    { name: 'pauseCampaign', description: 'Pause an active campaign', input_schema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'] } },
    { name: 'resumeCampaign', description: 'Resume a paused campaign', input_schema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'] } },
    { name: 'adjustBudget', description: 'Adjust a campaign budget', input_schema: { type: 'object', properties: { campaignId: { type: 'string' }, newDailyBudget: { type: 'number' } }, required: ['campaignId', 'newDailyBudget'] } },
    { name: 'triggerSeoAudit', description: 'Run a technical SEO audit', input_schema: { type: 'object', properties: {} } },
    { name: 'triggerAeoScan', description: 'Run an AEO visibility scan', input_schema: { type: 'object', properties: {} } },
    { name: 'generateReport', description: 'Generate a downloadable report', input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['campaign_performance', 'seo_audit', 'creative_analysis', 'funnel_analysis', 'aeo_citations', 'executive_summary'] }, days: { type: 'number' } }, required: ['type'] } },
    { name: 'connectIntegration', description: 'Start OAuth flow for a new integration', input_schema: { type: 'object', properties: { platform: { type: 'string' } }, required: ['platform'] } },
    { name: 'reconnectIntegration', description: 'Reconnect a failed integration', input_schema: { type: 'object', properties: { integrationId: { type: 'string' } }, required: ['integrationId'] } },
    // Display
    { name: 'showChart', description: 'Render an inline chart in the chat', input_schema: { type: 'object', properties: { chartType: { type: 'string', enum: ['line', 'bar', 'pie', 'area'] }, title: { type: 'string' }, data: { type: 'array', items: { type: 'object' } }, xKey: { type: 'string' }, yKeys: { type: 'array', items: { type: 'string' } } }, required: ['chartType', 'title', 'data', 'xKey', 'yKeys'] } },
    { name: 'showTable', description: 'Render an inline table in the chat', input_schema: { type: 'object', properties: { columns: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' } } } }, rows: { type: 'array', items: { type: 'object' } } }, required: ['columns', 'rows'] } },
    { name: 'showCreativePreview', description: 'Show a creative preview in chat', input_schema: { type: 'object', properties: { creativeId: { type: 'string' } }, required: ['creativeId'] } },
    { name: 'showAlert', description: 'Show a notification to the user', input_schema: { type: 'object', properties: { message: { type: 'string' }, type: { type: 'string', enum: ['info', 'warning', 'success', 'error'] } }, required: ['message', 'type'] } },
    { name: 'showUpgradePrompt', description: 'Show an upgrade CTA when a feature is tier-gated', input_schema: { type: 'object', properties: { feature: { type: 'string' }, requiredTier: { type: 'string' }, description: { type: 'string' } }, required: ['feature', 'requiredTier'] } },
    // Explanation
    { name: 'explainMetric', description: 'Explain what a metric means in plain language', input_schema: { type: 'object', properties: { metric: { type: 'string' } }, required: ['metric'] } },
    { name: 'explainAgent', description: 'Explain what an agent does', input_schema: { type: 'object', properties: { agentType: { type: 'string' } }, required: ['agentType'] } },
    { name: 'suggestAction', description: 'Generate an AI-powered recommendation based on context', input_schema: { type: 'object', properties: { context: { type: 'string' } }, required: ['context'] } },
  ];

  return allTools.filter((t) => allowed.includes(t.name as AssistantToolName));
}

// ── Data execution: runs tool calls that need server-side data ──────────────

interface ToolExecutionContext {
  tenantId: string;
  tier: SubscriptionTier;
}

async function executeDataTool(
  tool: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<unknown> {
  const { tenantId } = ctx;
  const days = typeof args.days === 'number' ? args.days : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const limit = typeof args.limit === 'number' ? Math.min(args.limit, 100) : 20;

  switch (tool) {
    case 'getAnalytics': {
      return withTenantDb(tenantId, async (db) => {
        const [summary] = await db.select({
          totalImpressions: sql<number>`coalesce(sum(impressions), 0)::int`,
          totalClicks: sql<number>`coalesce(sum(clicks), 0)::int`,
          totalConversions: sql<number>`coalesce(sum(conversions), 0)::int`,
          totalSpend: sql<number>`coalesce(sum(spend), 0)::real`,
          totalRevenue: sql<number>`coalesce(sum(revenue), 0)::real`,
          avgCtr: sql<number>`coalesce(avg(ctr), 0)::real`,
          avgRoas: sql<number>`coalesce(avg(roas), 0)::real`,
        }).from(analyticsDataPoints)
          .where(and(eq(analyticsDataPoints.tenantId, tenantId), gte(analyticsDataPoints.date, since)));
        return summary;
      });
    }
    case 'getCampaigns': {
      return withTenantDb(tenantId, async (db) => {
        const conditions = [eq(campaigns.tenantId, tenantId)];
        if (typeof args.status === 'string') conditions.push(eq(campaigns.status, args.status as never));
        const result = await db.select({
          id: campaigns.id, name: campaigns.name, type: campaigns.type,
          status: campaigns.status, platform: campaigns.platform,
          spend: campaigns.spend, roas: campaigns.roas,
          impressions: campaigns.impressions, clicks: campaigns.clicks,
          conversions: campaigns.conversions,
        }).from(campaigns)
          .where(and(...conditions))
          .orderBy(desc(campaigns.updatedAt)).limit(limit);
        return result;
      });
    }
    case 'getCreatives': {
      return withTenantDb(tenantId, async (db) => {
        const result = await db.select({
          id: creatives.id, name: creatives.name, format: creatives.format,
          platform: creatives.platform, status: creatives.status,
        }).from(creatives)
          .where(eq(creatives.tenantId, tenantId))
          .orderBy(desc(creatives.createdAt)).limit(limit);
        return result;
      });
    }
    case 'getAgentStatus': {
      return withTenantDb(tenantId, async (db) => {
        const result = await db.select({
          id: agents.id, type: agents.type, status: agents.status,
          lastHeartbeat: agents.lastHeartbeat,
          tasksCompleted: agents.tasksCompleted, tasksFailed: agents.tasksFailed,
        }).from(agents)
          .where(eq(agents.tenantId, tenantId));
        return result;
      });
    }
    case 'getIntegrationHealth': {
      return withTenantDb(tenantId, async (db) => {
        const result = await db.select({
          id: integrations.id, platform: integrations.platform,
          status: integrations.status, healthScore: integrations.healthScore,
          lastChecked: integrations.updatedAt,
        }).from(integrations)
          .where(eq(integrations.tenantId, tenantId));
        return result;
      });
    }
    case 'getSeoRankings': {
      return withTenantDb(tenantId, async (db) => {
        const result = await db.select().from(analyticsDataPoints)
          .where(and(
            eq(analyticsDataPoints.tenantId, tenantId),
            eq(analyticsDataPoints.channel, 'organic' as never),
            gte(analyticsDataPoints.date, since),
          ))
          .orderBy(desc(analyticsDataPoints.date)).limit(50);
        return result;
      });
    }
    case 'getAeoCitations': {
      return withTenantDb(tenantId, async (db) => {
        const result = await db.select().from(aeoCitations)
          .where(eq(aeoCitations.tenantId, tenantId))
          .orderBy(desc(aeoCitations.detectedAt)).limit(50);
        return result;
      });
    }
    case 'getFunnelData': {
      return withTenantDb(tenantId, async (db) => {
        const result = await db.select().from(funnelAnalysis)
          .where(and(eq(funnelAnalysis.tenantId, tenantId), gte(funnelAnalysis.date, since)))
          .orderBy(funnelAnalysis.stage);
        return result;
      });
    }
    default:
      return { message: `Tool ${tool} executed successfully` };
  }
}

/** Tools that return data to feed back to Claude */
const DATA_TOOLS = new Set<string>([
  'getAnalytics', 'getCampaigns', 'getCreatives', 'getAgentStatus',
  'getIntegrationHealth', 'getSeoRankings', 'getAeoCitations', 'getFunnelData',
]);

/** Tools that are rendered client-side (pass-through to frontend) */
const UI_TOOLS = new Set<string>([
  'navigate', 'openModal', 'closeModal', 'setDateRange', 'setFilter',
  'showChart', 'showTable', 'showCreativePreview', 'showAlert', 'showUpgradePrompt',
  'explainMetric', 'explainAgent', 'suggestAction',
]);

/** Tools that trigger server-side actions */
const ACTION_TOOLS = new Set<string>([
  'createCampaign', 'generateCreative', 'pauseCampaign', 'resumeCampaign',
  'adjustBudget', 'triggerSeoAudit', 'triggerAeoScan', 'generateReport',
  'connectIntegration', 'reconnectIntegration',
]);

// ── Build system prompt ────────────────────────────────────────────────────

interface TenantContext {
  tenantId: string;
  tenantName: string;
  tier: SubscriptionTier;
  domain: string | null;
  marketPreferences?: Record<string, unknown> | null;
  agentsSummary: string;
  integrationsSummary: string;
  recentMetricsSummary: string;
}

export function prefersArabic(message: string, marketPreferences?: Record<string, unknown> | null): boolean {
  const market = resolveMarketContext({
    ...(marketPreferences ?? {}),
    prompt: message,
  });

  return market.isArabic;
}

export function buildLanguageGuidance(message: string, marketPreferences?: Record<string, unknown> | null): string {
  const market = resolveMarketContext({
    ...(marketPreferences ?? {}),
    prompt: message,
  });
  const wantsArabic = market.isArabic;

  if (wantsArabic) {
    return `## Response Language
- The user context is Arabic-first. Respond in ${market.dialect === 'msa' || market.dialect === 'auto' ? 'clear Modern Standard Arabic' : `${market.dialect} Arabic when it improves naturalness, while keeping product and technical explanations stable`}.
- Use readable RTL-friendly formatting: short paragraphs, explicit headings when useful, and flat bullet lists.
- Keep product names, URLs, API paths, code, and integration names in their original Latin script.
- Do not transliterate Arabic into Latin characters.
- Respect regional intent for ${market.countryCode ?? 'the target market'} instead of direct English-to-Arabic translation.`;
  }

  return `## Response Language
- Respond in the same language as the user unless they explicitly request another language.`;
}

async function buildTenantContext(tenantId: string): Promise<TenantContext> {
  return withTenantDb(tenantId, async (db) => {
    const [tenant] = await db.select({
      id: tenants.id, name: tenants.name, plan: tenants.plan, domain: tenants.domain, settings: tenants.settings,
    }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);

    if (!tenant) throw new Error('Tenant not found');

    const agentRows = await db.select({ type: agents.type, status: agents.status })
      .from(agents).where(eq(agents.tenantId, tenantId));
    const agentsSummary = agentRows.length > 0
      ? agentRows.map((a) => `${a.type}: ${a.status}`).join(', ')
      : 'No agents active';

    const intRows = await db.select({ platform: integrations.platform, status: integrations.status })
      .from(integrations).where(eq(integrations.tenantId, tenantId));
    const integrationsSummary = intRows.length > 0
      ? intRows.map((i) => `${i.platform}: ${i.status}`).join(', ')
      : 'No integrations connected';

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [metrics] = await db.select({
      impressions: sql<number>`coalesce(sum(impressions), 0)::int`,
      clicks: sql<number>`coalesce(sum(clicks), 0)::int`,
      conversions: sql<number>`coalesce(sum(conversions), 0)::int`,
      spend: sql<number>`coalesce(sum(spend), 0)::real`,
      revenue: sql<number>`coalesce(sum(revenue), 0)::real`,
    }).from(analyticsDataPoints)
      .where(and(eq(analyticsDataPoints.tenantId, tenantId), gte(analyticsDataPoints.date, since30d)));

    const recentMetricsSummary = `Last 30 days: ${metrics.impressions} impressions, ${metrics.clicks} clicks, ${metrics.conversions} conversions, $${Number(metrics.spend || 0).toFixed(0)} spent, $${Number(metrics.revenue || 0).toFixed(0)} revenue`;

    return {
      tenantId,
      tenantName: tenant.name,
      tier: tenant.plan as SubscriptionTier,
      domain: tenant.domain,
      marketPreferences: ((tenant.settings as Record<string, unknown> | null)?.marketPreferences as Record<string, unknown> | undefined) ?? null,
      agentsSummary,
      integrationsSummary,
      recentMetricsSummary,
    };
  });
}

function buildSystemPrompt(ctx: TenantContext, uiContext: UIContext, userMessage: string, intelligenceBlock?: string): string {
  return `You are NexusAI, the intelligent digital assistant for the NexusZero marketing platform.

## About You
You help ${ctx.tenantName} manage their marketing operations, campaigns, analytics, and integrations through conversation. You are knowledgeable, proactive, and always actionable.

## Current Context
- **Tenant**: ${ctx.tenantName} (${ctx.tier} plan)
- **Domain**: ${ctx.domain || 'not set'}
- **Agents**: ${ctx.agentsSummary}
- **Integrations**: ${ctx.integrationsSummary}
- **Metrics**: ${ctx.recentMetricsSummary}

## Current UI State
- **Page**: ${uiContext.currentPage}
${uiContext.selectedDateRange ? `- **Date Range**: ${uiContext.selectedDateRange.start} to ${uiContext.selectedDateRange.end}` : ''}
${uiContext.activeFilters ? `- **Active Filters**: ${JSON.stringify(uiContext.activeFilters)}` : ''}
${uiContext.visibleDataSummary ? `- **Visible Data**: ${uiContext.visibleDataSummary}` : ''}

## Subscription: ${TIER_DISPLAY_NAMES[ctx.tier]}
${ctx.tier !== 'enterprise' ? `Some features are not available on this plan. When the user asks for a gated feature, explain it warmly and suggest upgrading. Use the showUpgradePrompt tool when appropriate.` : 'All features are available.'}

${intelligenceBlock ?? ''}

${buildLanguageGuidance(userMessage, ctx.marketPreferences)}

## Guidelines
1. Be concise but thorough. Lead with actionable insights.
2. Use data tools to fetch real data before answering questions. Never guess numbers.
3. Use display tools (showChart, showTable) to present data visually in the chat.
4. For multi-step workflows, explain what you're doing step by step.
5. Be context-aware — reference the page the user is on and the data they're looking at.
6. When suggesting actions, be specific and offer to execute them.
7. Always format currency with $ and percentages with %.
8. If data is empty or missing, say so honestly and suggest next steps.
9. Do not use emojis or decorative pictographs. Keep the tone professional and businesslike.
10. Use the Customer Intelligence section to personalise every response. Adapt your tone, depth, and suggestions to the customer's skill level, journey phase, and focus areas.
11. When proactive guidance includes health warnings or performance alerts relevant to the conversation, mention them naturally without being alarmist.
12. Suggest unexplored features only when contextually relevant to what the user is asking about.`;
}

function sanitizeAssistantText(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\u200D\uFE0F]/gu, '');
}

// ── Session management ─────────────────────────────────────────────────────

async function getOrCreateSession(
  tenantId: string,
  userId: string,
  sessionId?: string,
): Promise<string> {
  return withTenantDb(tenantId, async (db) => {
    if (sessionId) {
      const [existing] = await db.select({ id: assistantSessions.id })
        .from(assistantSessions)
        .where(and(eq(assistantSessions.id, sessionId), eq(assistantSessions.tenantId, tenantId)))
        .limit(1);
      if (existing) {
        await db.update(assistantSessions)
          .set({ lastMessageAt: new Date(), messageCount: sql`message_count + 1` })
          .where(eq(assistantSessions.id, existing.id));
        return existing.id;
      }
    }

    const newId = randomUUID();
    await db.insert(assistantSessions).values({
      id: newId, tenantId, userId, messageCount: 1,
    });
    return newId;
  });
}

async function getConversationHistory(
  tenantId: string,
  sessionId: string,
  maxMessages: number = 20,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  return withTenantDb(tenantId, async (db) => {
    const messages = await db.select({
      role: assistantMessages.role,
      content: assistantMessages.content,
    }).from(assistantMessages)
      .where(and(
        eq(assistantMessages.sessionId, sessionId),
        eq(assistantMessages.tenantId, tenantId),
      ))
      .orderBy(desc(assistantMessages.createdAt))
      .limit(maxMessages);
    return messages.reverse();
  });
}

async function saveMessage(
  tenantId: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls: ToolCall[] = [],
  uiContext?: UIContext,
  tokensUsed: number = 0,
  latencyMs: number = 0,
): Promise<void> {
  await withTenantDb(tenantId, async (db) => {
    await db.insert(assistantMessages).values({
      sessionId,
      tenantId,
      role,
      content,
      toolCalls: toolCalls as unknown as Record<string, unknown>[],
      uiContext: uiContext as unknown as Record<string, unknown>,
      tokensUsed,
      latencyMs,
    });
  });
}

// ── Main chat handler ──────────────────────────────────────────────────────

export interface ChatParams {
  tenantId: string;
  userId: string;
  message: string;
  sessionId?: string;
  uiContext: UIContext;
}

export async function* handleAssistantChat(params: ChatParams): AsyncGenerator<AssistantStreamEvent> {
  const { tenantId, userId, message, uiContext } = params;
  const startMs = Date.now();
  let respondInArabic = prefersArabic(message);

  if (!ANTHROPIC_API_KEY) {
    console.error('[NexusAI] ANTHROPIC_API_KEY is empty at runtime — check env vars');
    yield { type: 'text', content: 'NexusAI is not configured. Please set the ANTHROPIC_API_KEY environment variable.' };
    yield { type: 'done' };
    return;
  }

  // 1. Load tenant context, customer intelligence & session
  let tenantCtx: TenantContext;
  let intelligenceBlock = '';
  try {
    const [ctx, intel] = await Promise.all([
      buildTenantContext(tenantId),
      buildCustomerIntelligence(tenantId, userId).catch((err) => {
        console.error('[NexusAI] Intelligence layers failed (non-fatal):', err instanceof Error ? err.message : err);
        return null;
      }),
    ]);
    tenantCtx = ctx;
    respondInArabic = prefersArabic(message, tenantCtx.marketPreferences);
    if (intel) {
      intelligenceBlock = renderIntelligencePrompt(intel);
    }
  } catch {
    yield { type: 'error', message: 'Failed to load tenant context' };
    yield { type: 'done' };
    return;
  }

  let sessionId = params.sessionId ?? randomUUID();
  let persistenceEnabled = true;
  try {
    sessionId = await getOrCreateSession(tenantId, userId, params.sessionId);
  } catch (err) {
    persistenceEnabled = false;
    console.error('[NexusAI] Session creation failed, continuing without persistence:', {
      tenantId,
      userId,
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (persistenceEnabled) {
    try {
      await saveMessage(tenantId, sessionId, 'user', message, [], uiContext);
    } catch (err) {
      console.error('[NexusAI] Failed to save user message:', err);
      // Non-fatal — continue even if message save fails
    }
  }

  // 2. Build Claude request
  const systemPrompt = buildSystemPrompt(tenantCtx, uiContext, message, intelligenceBlock);
  const tools = buildToolDefinitions(tenantCtx.tier);

  let history: Array<{ role: 'user' | 'assistant'; content: string }>;
  if (persistenceEnabled) {
    try {
      history = await getConversationHistory(tenantId, sessionId);
    } catch (err) {
      console.error('[NexusAI] Failed to load history:', err);
      history = [];
    }
  } else {
    history = [];
  }

  // Build messages array (history + current message)
  const claudeMessages: Array<{ role: string; content: string | Array<{ type: string; tool_use_id?: string; content?: string }> }> = [];
  for (const msg of history.slice(0, -1)) {
    claudeMessages.push({ role: msg.role, content: msg.content });
  }
  claudeMessages.push({ role: 'user', content: message });

  const allToolCalls: ToolCall[] = [];
  let fullTextResponse = '';
  let totalTokens = 0;

  // 3. Agentic loop — call Claude, process tool calls, repeat
  let iteration = 0;
  const maxIterations = 5;

  try {
  while (iteration < maxIterations) {
    iteration++;

    let claudeResponse: {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    try {
      const res = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          tools: tools.length > 0 ? tools : undefined,
          messages: claudeMessages,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        console.error(`[NexusAI] Claude API error ${res.status}:`, errorBody);
        const hint = res.status === 401 ? ' (invalid API key)' :
                     res.status === 429 ? ' (rate limited)' :
                     res.status === 404 ? ` (model "${CLAUDE_MODEL}" not found)` : '';
        yield { type: 'error', message: `AI service error${hint}. Please try again.` };
        yield { type: 'done' };
        return;
      }

      claudeResponse = await res.json() as typeof claudeResponse;
    } catch (err) {
      console.error('[NexusAI] Claude request failed:', err);
      yield { type: 'error', message: 'Failed to reach AI service.' };
      yield { type: 'done' };
      return;
    }

    if (claudeResponse.usage) {
      totalTokens += claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens;
    }

    // Process response content blocks
    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
    let hasToolUse = false;

    // Build assistant message content for the messages array
    const assistantContent: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = [];

    for (const block of claudeResponse.content) {
      if (block.type === 'text' && block.text) {
        const sanitizedText = sanitizeAssistantText(block.text);
        fullTextResponse += sanitizedText;
        assistantContent.push(block);
        yield { type: 'text', content: sanitizedText };
      } else if (block.type === 'tool_use' && block.name && block.id) {
        hasToolUse = true;
        assistantContent.push(block);
        const toolName = block.name as AssistantToolName;
        const toolArgs = block.input ?? {};

        // Tier gate check
        const gate = gateTool(tenantCtx.tier, toolName);
        if (!gate.allowed) {
          const gateMsg = gate.reason ?? 'Feature not available on your plan.';
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: gateMsg }) });
          yield { type: 'text', content: `\n\n${gateMsg}` };
          continue;
        }

        const toolCall: ToolCall = {
          id: block.id,
          tool: toolName,
          args: toolArgs,
        };

        if (DATA_TOOLS.has(toolName)) {
          // Execute data tool server-side and feed result back to Claude
          try {
            const result = await executeDataTool(toolName, toolArgs, { tenantId, tier: tenantCtx.tier });
            toolCall.result = result;
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Tool execution failed';
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: errMsg }) });
          }
        } else if (UI_TOOLS.has(toolName) || ACTION_TOOLS.has(toolName)) {
          // Pass UI/action tools through to frontend
          yield { type: 'tool_call', toolCall };
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ success: true }) });
        }

        allToolCalls.push(toolCall);
      }
    }

    // If Claude used tools, add assistant response + tool results and continue the loop
    if (hasToolUse && claudeResponse.stop_reason === 'tool_use') {
      claudeMessages.push({ role: 'assistant', content: assistantContent as never });
      claudeMessages.push({ role: 'user', content: toolResults as never });
      continue;
    }

    // Otherwise, we're done
    break;
  }

  } catch (err) {
    console.error('[NexusAI] Agentic loop error:', err);
    if (!fullTextResponse) {
      yield { type: 'error', message: 'Something went wrong generating a response. Please try again.' };
      yield { type: 'done' };
      return;
    }
  }

  // If the agentic loop produced tool calls but no text, yield a fallback summary
  if (!fullTextResponse && allToolCalls.length > 0) {
    fullTextResponse = respondInArabic
      ? 'تم تنفيذ طلبك باستخدام الأدوات المتاحة. إذا أردت، أستطيع شرح النتيجة أو المتابعة بخطوة تالية.'
      : 'I processed your request using tools. Let me know if you need more details.';
    yield { type: 'text', content: fullTextResponse };
  } else if (!fullTextResponse) {
    fullTextResponse = respondInArabic
      ? 'لم أتمكن من صياغة رد واضح هذه المرة. حاول إعادة كتابة سؤالك بشكل أقصر أو أكثر تحديدًا.'
      : "I wasn't able to generate a response. Please try rephrasing your question.";
    yield { type: 'text', content: fullTextResponse };
  }

  // 4. Save response
  const latencyMs = Date.now() - startMs;
  if (persistenceEnabled) {
    try {
      await saveMessage(tenantId, sessionId, 'assistant', fullTextResponse, allToolCalls, undefined, totalTokens, latencyMs);
    } catch (err) {
      console.error('[NexusAI] Failed to save assistant message:', err);
    }
  }

  // 5. Emit session ID and done
  yield { type: 'text', content: `\n<!-- session:${sessionId} -->` };
  yield { type: 'done' };
}

/** Get recent sessions for a tenant user */
export async function getAssistantSessions(tenantId: string, userId: string) {
  return withTenantDb(tenantId, async (db) => {
    return db.select().from(assistantSessions)
      .where(and(eq(assistantSessions.tenantId, tenantId), eq(assistantSessions.userId, userId)))
      .orderBy(desc(assistantSessions.lastMessageAt))
      .limit(20);
  });
}

/** Get messages for a session */
export async function getSessionMessages(tenantId: string, sessionId: string) {
  return withTenantDb(tenantId, async (db) => {
    return db.select().from(assistantMessages)
      .where(and(eq(assistantMessages.sessionId, sessionId), eq(assistantMessages.tenantId, tenantId)))
      .orderBy(assistantMessages.createdAt);
  });
}
