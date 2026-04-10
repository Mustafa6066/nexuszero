import { routedCompletionWithUsage } from '@nexuszero/llm-router';
import type { OperatingPicture } from '../types.js';

// ---------------------------------------------------------------------------
// Operating Context Intelligence — Layer 3
//
// Synthesizes current tenant state into a structured document that any LLM
// call can consume. Generates a human-readable operating picture summary.
//
// Generalizes the 4-layer customer intelligence from api-gateway for
// Brain-level reasoning.
// ---------------------------------------------------------------------------

const MAX_CONTEXT_TOKENS = 2000;

export class OperatingContextIntelligence {
  /**
   * Generate a structured operating context document for LLM consumption.
   * This is injected into agent prompts as tenant context (Layer 2 of 4-layer prompt).
   */
  generateContextDocument(picture: OperatingPicture): string {
    const sections: string[] = [];

    // Fleet status summary
    sections.push(this.formatFleetStatus(picture));

    // Integration health
    sections.push(this.formatIntegrationHealth(picture));

    // Recent outcomes
    sections.push(this.formatRecentOutcomes(picture));

    // Active signals
    sections.push(this.formatActiveSignals(picture));

    // KPI snapshot
    sections.push(this.formatKpiSnapshot(picture));

    // Strategy status
    sections.push(this.formatStrategyStatus(picture));

    return sections.filter(Boolean).join('\n\n');
  }

  /**
   * Generate an LLM-powered narrative summary of the operating picture.
   * Used for dashboard display and manager briefings.
   */
  async generateNarrativeSummary(picture: OperatingPicture): Promise<string> {
    const context = this.generateContextDocument(picture);

    const result = await routedCompletionWithUsage({
      model: 'anthropic/claude-3.5-haiku-20241022',
      systemPrompt: `You are an operations intelligence analyst for a multi-agent AI platform.
Summarize the operating picture in 3-5 concise sentences. Focus on:
1. What's working well
2. What needs attention
3. Recommended next action
Be specific with numbers. No jargon.`,
      messages: [{ role: 'user', content: context }],
      maxTokens: 300,
      temperature: 0.3,
      agentType: 'brain',
    });

    return result.content;
  }

  private formatFleetStatus(picture: OperatingPicture): string {
    const { fleet } = picture;
    const active = fleet.agents.filter(a => a.activity === 'active').length;
    const idle = fleet.agents.filter(a => a.activity === 'idle').length;
    const degraded = fleet.agents.filter(a => a.activity === 'degraded').length;
    const blocked = fleet.agents.filter(a => a.activity === 'blocked').length;

    let status = `## Fleet Status\n`;
    status += `Total agents: ${fleet.agents.length} | Active: ${active} | Idle: ${idle}`;
    if (degraded > 0) status += ` | Degraded: ${degraded}`;
    if (blocked > 0) status += ` | Blocked: ${blocked}`;
    status += `\nFleet health: ${(fleet.fleetHealthScore * 100).toFixed(0)}%`;
    status += `\nActive jobs: ${fleet.totalActiveJobs} | Queued: ${fleet.totalQueuedJobs}`;

    if (degraded > 0) {
      const degradedAgents = fleet.agents.filter(a => a.activity === 'degraded');
      status += `\n\nDegraded agents:`;
      for (const agent of degradedAgents) {
        status += `\n- ${agent.agentType}: health ${(agent.healthScore * 100).toFixed(0)}%, success rate ${(agent.recentSuccessRate * 100).toFixed(0)}%`;
      }
    }

    return status;
  }

  private formatIntegrationHealth(picture: OperatingPicture): string {
    if (picture.integrations.length === 0) return '';

    const healthy = picture.integrations.filter(i => i.status === 'healthy').length;
    const degraded = picture.integrations.filter(i => i.status === 'degraded').length;
    const errored = picture.integrations.filter(i => i.status === 'error').length;

    let status = `## Integration Health\n`;
    status += `Total: ${picture.integrations.length} | Healthy: ${healthy}`;
    if (degraded > 0) status += ` | Degraded: ${degraded}`;
    if (errored > 0) status += ` | Error: ${errored}`;

    const issues = picture.integrations.filter(i => i.status !== 'healthy');
    if (issues.length > 0) {
      status += `\n\nIssues:`;
      for (const issue of issues.slice(0, 5)) {
        status += `\n- ${issue.platform}: ${issue.status} (error rate: ${(issue.errorRate * 100).toFixed(1)}%)`;
      }
    }

    return status;
  }

  private formatRecentOutcomes(picture: OperatingPicture): string {
    const outcomes = picture.recentOutcomes;
    if (outcomes.length === 0) return '';

    const completed = outcomes.filter(o => o.status === 'completed').length;
    const failed = outcomes.filter(o => o.status === 'failed').length;
    const avgDuration = outcomes.reduce((sum, o) => sum + o.durationMs, 0) / outcomes.length;

    let status = `## Recent Outcomes (24h)\n`;
    status += `Total: ${outcomes.length} | Completed: ${completed} | Failed: ${failed}`;
    status += `\nSuccess rate: ${(completed / outcomes.length * 100).toFixed(0)}%`;
    status += `\nAvg duration: ${(avgDuration / 1000).toFixed(1)}s`;

    if (failed > 0) {
      const failures = outcomes.filter(o => o.status === 'failed').slice(0, 3);
      status += `\n\nRecent failures:`;
      for (const f of failures) {
        status += `\n- ${f.taskType} (${f.agentType})`;
      }
    }

    return status;
  }

  private formatActiveSignals(picture: OperatingPicture): string {
    const signals = picture.signals.signals;
    if (signals.length === 0) return '';

    // Group by type
    const grouped = new Map<string, number>();
    for (const signal of signals) {
      grouped.set(signal.type, (grouped.get(signal.type) ?? 0) + 1);
    }

    let status = `## Active Signals\n`;
    status += `Total: ${signals.length} in the current window`;

    const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted.slice(0, 10)) {
      status += `\n- ${type}: ${count}`;
    }

    return status;
  }

  private formatKpiSnapshot(picture: OperatingPicture): string {
    const kpis = picture.kpiSnapshot;
    if (Object.keys(kpis).length === 0) return '';

    let status = `## KPI Snapshot\n`;
    for (const [metric, value] of Object.entries(kpis)) {
      status += `- ${metric}: ${typeof value === 'number' ? value.toFixed(2) : value}\n`;
    }

    return status;
  }

  private formatStrategyStatus(picture: OperatingPicture): string {
    const strategies = picture.activeStrategies;
    if (strategies.length === 0) return '';

    const healthy = strategies.filter(s => s.status === 'active').length;
    const stale = strategies.filter(s => s.status === 'stale').length;
    const conflicting = strategies.filter(s => s.status === 'conflicting').length;

    let status = `## Strategy Status\n`;
    status += `Active: ${healthy}`;
    if (stale > 0) status += ` | Stale: ${stale}`;
    if (conflicting > 0) status += ` | Conflicting: ${conflicting}`;

    return status;
  }
}
