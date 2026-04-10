import { getRedisConnection } from '@nexuszero/queue';
import type { OperatingPicture } from '../types.js';
import { OperatingContextIntelligence } from '../intelligence/operating-context.js';

// ---------------------------------------------------------------------------
// Prompt Assembler — Phase 4.3
//
// Builds agent prompts in 4 layers:
// 1. Base instruction — Agent role, capabilities, safety rules
// 2. Tenant operating context — Current state, priorities, integrations
// 3. Task-specific directives — What to do, success criteria, constraints
// 4. Historical outcome patterns — Past results + adjustments
//
// Reference: Agent Orchestrator's prompt-builder.ts (3-layer) + existing
// renderIntelligencePrompt() in api-gateway intelligence service.
// ---------------------------------------------------------------------------

const PATTERN_CACHE_KEY = (tenantId: string, taskType: string) =>
  `brain:outcome-patterns:${tenantId}:${taskType}`;

export interface PromptLayers {
  baseInstruction: string;
  operatingContext: string;
  taskDirectives: string;
  historicalPatterns: string;
}

export interface AssembledPrompt {
  systemPrompt: string;
  layers: PromptLayers;
  tokenEstimate: number;
}

export class PromptAssembler {
  private contextIntelligence = new OperatingContextIntelligence();

  /** Assemble a complete 4-layer prompt for an agent task */
  async assemble(
    tenantId: string,
    agentType: string,
    taskType: string,
    taskContext: Record<string, unknown>,
    picture: OperatingPicture,
  ): Promise<AssembledPrompt> {
    const layers: PromptLayers = {
      baseInstruction: this.buildBaseInstruction(agentType),
      operatingContext: this.contextIntelligence.generateContextDocument(picture),
      taskDirectives: this.buildTaskDirectives(taskType, taskContext),
      historicalPatterns: await this.buildHistoricalPatterns(tenantId, taskType),
    };

    const systemPrompt = [
      layers.baseInstruction,
      '\n---\n',
      layers.operatingContext,
      '\n---\n',
      layers.taskDirectives,
      layers.historicalPatterns ? `\n---\n${layers.historicalPatterns}` : '',
    ].join('');

    // Rough token estimate (4 chars per token avg)
    const tokenEstimate = Math.ceil(systemPrompt.length / 4);

    return { systemPrompt, layers, tokenEstimate };
  }

  /** Record an outcome pattern for future prompt injection */
  async recordOutcomePattern(
    tenantId: string,
    taskType: string,
    pattern: { input: string; outcome: string; adjustment: string },
  ): Promise<void> {
    const redis = getRedisConnection();
    const key = PATTERN_CACHE_KEY(tenantId, taskType);

    const raw = await redis.get(key);
    let patterns: Array<{ input: string; outcome: string; adjustment: string }> = [];
    if (raw) {
      try {
        patterns = JSON.parse(raw);
      } catch {
        patterns = [];
      }
    }

    patterns.push(pattern);

    // Keep at most 20 patterns per task type
    if (patterns.length > 20) {
      patterns = patterns.slice(-20);
    }

    await redis.setex(key, 30 * 24 * 3_600, JSON.stringify(patterns)); // 30 days
  }

  // ---------- Layer 1: Base Instruction ----------

  private buildBaseInstruction(agentType: string): string {
    const instructions = AGENT_BASE_INSTRUCTIONS[agentType];
    if (instructions) return instructions;

    return `You are the ${agentType} agent in the NexusZero multi-agent platform.
Execute your assigned tasks accurately and efficiently.
Report results with structured data. Flag any issues or anomalies.
Follow tenant-specific constraints and safety rules.`;
  }

  // ---------- Layer 3: Task Directives ----------

  private buildTaskDirectives(
    taskType: string,
    context: Record<string, unknown>,
  ): string {
    let directives = `## Task: ${taskType}\n\n`;

    // Include relevant context
    if (Object.keys(context).length > 0) {
      directives += `### Context\n`;
      for (const [key, value] of Object.entries(context)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          directives += `- ${key}: ${value}\n`;
        } else if (value !== null && value !== undefined) {
          directives += `- ${key}: ${JSON.stringify(value)}\n`;
        }
      }
      directives += '\n';
    }

    // Task-specific guidelines
    const guidelines = TASK_GUIDELINES[taskType];
    if (guidelines) {
      directives += `### Guidelines\n${guidelines}\n`;
    }

    directives += `### Output Requirements\n`;
    directives += `- Return structured JSON with clear success/failure indicators\n`;
    directives += `- Include confidence scores where applicable\n`;
    directives += `- Flag any data quality issues encountered\n`;

    return directives;
  }

  // ---------- Layer 4: Historical Patterns ----------

  private async buildHistoricalPatterns(
    tenantId: string,
    taskType: string,
  ): Promise<string> {
    const redis = getRedisConnection();
    const key = PATTERN_CACHE_KEY(tenantId, taskType);
    const raw = await redis.get(key);

    if (!raw) return '';

    let patterns: Array<{ input: string; outcome: string; adjustment: string }>;
    try {
      patterns = JSON.parse(raw);
    } catch {
      return '';
    }

    if (patterns.length === 0) return '';

    // Take the 5 most recent patterns
    const recent = patterns.slice(-5);

    let section = `## Historical Patterns\n`;
    section += `The following past outcomes may inform your approach:\n\n`;

    for (const pattern of recent) {
      section += `- **Input:** ${pattern.input}\n`;
      section += `  **Outcome:** ${pattern.outcome}\n`;
      section += `  **Adjustment:** ${pattern.adjustment}\n\n`;
    }

    return section;
  }
}

// ---------------------------------------------------------------------------
// Agent base instructions by type
// ---------------------------------------------------------------------------
const AGENT_BASE_INSTRUCTIONS: Record<string, string> = {
  seo: `You are the SEO Agent in the NexusZero platform.
Your role: keyword research, content optimization, technical SEO audits, and ranking tracking.
Produce actionable SEO recommendations with data-backed reasoning.
Never make claims without evidence.`,

  ad: `You are the Ad Agent in the NexusZero platform.
Your role: campaign management, bid optimization, audience targeting, and performance analysis.
Optimize for ROAS while respecting budget constraints. Flag creative fatigue proactively.`,

  'content-writer': `You are the Content Writer Agent in the NexusZero platform.
Your role: generate high-quality content that meets SEO and brand guidelines.
Write in the brand voice. Produce expert-panel-grade content with proper citations.`,

  'data-nexus': `You are the Data Nexus Agent in the NexusZero platform.
Your role: daily data processing, anomaly detection, forecasting, and insight generation.
Provide actionable insights with statistical confidence. Never overstate findings.`,

  aeo: `You are the AEO (Answer Engine Optimization) Agent in the NexusZero platform.
Your role: monitor AI engine visibility, analyze citations, and optimize for AI search.
Track entity presence across AI platforms. Report changes with context.`,
};

// ---------------------------------------------------------------------------
// Task-specific guidelines
// ---------------------------------------------------------------------------
const TASK_GUIDELINES: Record<string, string> = {
  seo_audit: `Perform a comprehensive technical SEO audit. Check: meta tags, page speed, mobile-friendliness, internal linking, schema markup, and crawlability. Prioritize findings by impact.`,
  keyword_research: `Research keywords with: search volume, difficulty, intent classification, and SERP features. Group into clusters. Identify quick wins and long-term targets.`,
  content_optimization: `Optimize existing content for target keywords. Improve: title, meta description, headings, keyword density, internal links, and readability. Maintain brand voice.`,
  ad_campaign_optimization: `Analyze campaign performance. Identify: underperforming ad groups, keyword opportunities, bid adjustments, and budget reallocation. Provide specific recommendations with expected impact.`,
  data_daily_digest: `Compile daily metrics digest: traffic, conversions, revenue, ad spend, rankings changes. Highlight anomalies and trends. Compare against 7-day averages.`,
};
