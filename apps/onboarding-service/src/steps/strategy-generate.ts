import { randomUUID } from 'node:crypto';
import { getDb, tenants, campaigns, entityProfiles } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { publishAgentTask } from '@nexuszero/queue';
import { routedCompletion } from '@nexuszero/llm-router';

/**
 * Strategy Generate Step
 * Uses AI agents + LLM to generate an initial marketing strategy based on
 * the audit results, business type, connected platforms, and tenant goals.
 */
export class StrategyGenerateStep {
  async execute(tenantId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = getDb();

    const [tenant] = await db.select().from(tenants)
      .where(eq(tenants.id, tenantId)).limit(1);

    if (!tenant) throw new Error('Tenant not found');

    const auditResults = config.auditResults as Record<string, unknown> | undefined;
    const businessType = (config.businessType ?? (tenant.settings as any)?.businessType ?? 'other') as string;
    const goal = (config.goal ?? (tenant.settings as any)?.primaryGoal ?? 'diagnose_issues') as string;
    const channel = (config.channel ?? (tenant.settings as any)?.primaryChannel ?? 'full_funnel') as string;
    const connectedPlatforms = (config.connectedPlatforms ?? []) as string[];

    // Generate personalized 90-day strategy via LLM
    const strategy = await this.generatePersonalizedStrategy(tenant, {
      businessType,
      goal,
      channel,
      connectedPlatforms,
      auditResults,
    });

    // Persist strategy to tenant settings
    const settings = (tenant.settings || {}) as Record<string, unknown>;
    settings.strategy = strategy;
    settings.businessType = businessType;
    settings.primaryGoal = goal;
    settings.primaryChannel = channel;
    await db.update(tenants).set({ settings }).where(eq(tenants.id, tenantId));

    // Queue keyword research for SEO strategy
    const keywordTaskId = randomUUID();
    await publishAgentTask({
      id: keywordTaskId,
      tenantId,
      agentType: 'seo',
      type: 'keyword_research',
      priority: 'high',
      input: {
        isOnboarding: true,
        domain: tenant.domain,
        auditFindings: auditResults,
      },
    });

    // Queue initial data analysis
    const analysisTaskId = randomUUID();
    await publishAgentTask({
      id: analysisTaskId,
      tenantId,
      agentType: 'data-nexus',
      type: 'daily_analysis',
      priority: 'high',
      input: {
        isOnboarding: true,
      },
    });

    // Queue AEO entity setup if applicable
    let aeoTaskId: string | null = null;
    if (tenant.plan !== 'launchpad') {
      // Auto-create a default entity profile so the AEO agent has something to work with
      const existingEntities = await db.select({ id: entityProfiles.id })
        .from(entityProfiles)
        .where(eq(entityProfiles.tenantId, tenantId))
        .limit(1);

      if (existingEntities.length === 0) {
        const settings = (tenant.settings || {}) as Record<string, unknown>;
        await db.insert(entityProfiles).values({
          tenantId,
          entityName: tenant.name,
          entityType: 'Organization',
          description: tenant.domain
            ? `${tenant.name} — ${tenant.domain}`
            : tenant.name,
          attributes: {
            domain: tenant.domain,
            industry: settings.industry ?? null,
            autoCreated: true,
          },
        });
      }

      aeoTaskId = randomUUID();
      await publishAgentTask({
        id: aeoTaskId,
        tenantId,
        agentType: 'aeo',
        type: 'analyze_visibility',
        priority: 'medium',
        input: {
          isOnboarding: true,
        },
      });
    }

    return {
      strategy,
      strategyTasks: {
        keywordResearch: keywordTaskId,
        dataAnalysis: analysisTaskId,
        aeoVisibility: aeoTaskId,
      },
      autoGoLive: (config as any).autoGoLive ?? false,
    };
  }

  private async generatePersonalizedStrategy(
    tenant: typeof tenants.$inferSelect,
    context: {
      businessType: string;
      goal: string;
      channel: string;
      connectedPlatforms: string[];
      auditResults?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    const prompt = `You are a digital marketing strategist for NexusZero, an AI-powered marketing platform.

Generate a personalized 90-day marketing strategy for this business:

Business: ${tenant.name}
Domain: ${tenant.domain ?? 'N/A'}
Plan: ${tenant.plan}
Business Type: ${context.businessType}
Primary Goal: ${context.goal}
Primary Channel: ${context.channel}
Connected Platforms: ${context.connectedPlatforms.join(', ') || 'None yet'}
Audit Summary: ${context.auditResults ? JSON.stringify(context.auditResults).slice(0, 2000) : 'No audit data'}

Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence strategy summary",
  "phases": [
    {
      "name": "Phase name",
      "weeks": "1-4",
      "focus": "Short description",
      "actions": ["action1", "action2"]
    }
  ],
  "milestones": [
    {
      "id": "unique-id",
      "title": "Milestone title",
      "description": "What this milestone means",
      "week": 1,
      "status": "pending",
      "agentType": "seo|aeo|social|content|ad|geo|data-nexus|null",
      "automated": true
    }
  ],
  "kpis": [
    {
      "metric": "Metric name",
      "baseline": "Current/estimated value",
      "target": "90-day target",
      "trackingAgent": "agent responsible"
    }
  ],
  "firstMission": {
    "title": "First actionable mission title",
    "description": "What the user should focus on right now",
    "agentType": "which agent handles this",
    "estimatedImpact": "Expected outcome"
  }
}

Rules:
- Generate 3 phases (Foundation weeks 1-4, Growth weeks 5-8, Scale weeks 9-12)
- Generate 8-12 milestones spread across the 12 weeks
- Include 4-6 KPIs relevant to the goal and business type
- The firstMission should be immediately actionable and high-impact
- Milestones should leverage the connected platforms
- Mark milestones as automated:true when an agent can handle them autonomously
- Return ONLY valid JSON, no markdown or explanation`;

    try {
      const result = await routedCompletion({
        model: 'smart',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 3000,
      });

      const content = result.choices[0]?.message?.content ?? '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in LLM response');

      const strategy = JSON.parse(jsonMatch[0]);

      // Ensure all milestones have IDs
      if (strategy.milestones) {
        for (const m of strategy.milestones) {
          if (!m.id) m.id = randomUUID();
          if (!m.status) m.status = 'pending';
        }
      }

      strategy.generatedAt = new Date().toISOString();
      strategy.businessType = context.businessType;
      strategy.goal = context.goal;

      return strategy;
    } catch {
      // Fallback strategy if LLM fails
      return this.buildFallbackStrategy(tenant, context);
    }
  }

  private buildFallbackStrategy(
    tenant: typeof tenants.$inferSelect,
    context: { businessType: string; goal: string; channel: string; connectedPlatforms: string[] },
  ): Record<string, unknown> {
    return {
      summary: `A foundation-first marketing strategy for ${tenant.name} focused on ${context.goal.replace(/_/g, ' ')}.`,
      generatedAt: new Date().toISOString(),
      businessType: context.businessType,
      goal: context.goal,
      phases: [
        { name: 'Foundation', weeks: '1-4', focus: 'Technical SEO audit and content baseline', actions: ['Fix critical SEO issues', 'Set up analytics tracking', 'Create content calendar'] },
        { name: 'Growth', weeks: '5-8', focus: 'Content production and distribution', actions: ['Publish optimized content', 'Launch social campaigns', 'Build backlink profile'] },
        { name: 'Scale', weeks: '9-12', focus: 'Optimization and expansion', actions: ['A/B test top performers', 'Expand to new channels', 'Automate recurring tasks'] },
      ],
      milestones: [
        { id: randomUUID(), title: 'SEO Audit Complete', description: 'Full technical SEO audit with prioritized fixes', week: 1, status: 'pending', agentType: 'seo', automated: true },
        { id: randomUUID(), title: 'Analytics Connected', description: 'All tracking platforms connected and verified', week: 2, status: 'pending', agentType: 'data-nexus', automated: true },
        { id: randomUUID(), title: 'Content Strategy Defined', description: 'Content calendar and topic clusters established', week: 3, status: 'pending', agentType: 'seo', automated: true },
        { id: randomUUID(), title: 'First Content Published', description: 'First AI-optimized content piece live', week: 5, status: 'pending', agentType: 'content', automated: true },
        { id: randomUUID(), title: 'Social Presence Active', description: 'Regular posting schedule established', week: 6, status: 'pending', agentType: 'social', automated: true },
        { id: randomUUID(), title: 'First Performance Review', description: 'Month 2 performance analysis and strategy adjustment', week: 8, status: 'pending', agentType: 'data-nexus', automated: true },
        { id: randomUUID(), title: '90-Day Results', description: 'Full quarter performance report', week: 12, status: 'pending', agentType: 'data-nexus', automated: true },
      ],
      kpis: [
        { metric: 'Organic Traffic', baseline: 'TBD', target: '+30%', trackingAgent: 'seo' },
        { metric: 'Keyword Rankings', baseline: 'TBD', target: '20 new page-1 rankings', trackingAgent: 'seo' },
        { metric: 'Content Published', baseline: '0', target: '12 pieces', trackingAgent: 'content' },
        { metric: 'Social Engagement', baseline: 'TBD', target: '+50%', trackingAgent: 'social' },
      ],
      firstMission: {
        title: 'Complete Your SEO Health Check',
        description: 'Run a comprehensive SEO audit to identify quick wins and critical issues.',
        agentType: 'seo',
        estimatedImpact: 'Identify 10-20 actionable improvements within 24 hours',
      },
    };
  }
}
