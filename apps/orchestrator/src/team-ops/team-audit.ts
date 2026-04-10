import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { createLogger } from '@nexuszero/shared';

const logger = createLogger('team-ops:team-audit');

/**
 * Team Audit — Elon Algorithm Framework
 *
 * 5-step framework: Question → Delete → Simplify → Accelerate → Automate
 * 4-dimension scoring: Output Velocity (30%), Quality (30%), Independence (20%), Initiative (20%)
 * A/B/C tier classification with actionable recommendations.
 *
 * NOT a separate agent — internal orchestrator capability exposed via API.
 *
 * Ported from: ai-marketing-skills/team-ops
 */

interface TeamMember {
  name: string;
  role: string;
  metrics?: Record<string, number>;
  recentWork?: string[];
  feedback?: string[];
}

interface TeamAuditInput {
  tenantId: string;
  teamMembers: TeamMember[];
  period?: string;
  goals?: string[];
  benchmarks?: Record<string, number>;
}

export async function runTeamAudit(input: TeamAuditInput) {
  const { tenantId, teamMembers = [], period = 'quarterly', goals = [], benchmarks = {} } = input;

  const prompt = `You are a COO applying the Elon Algorithm (5-step efficiency framework) to a team audit.

FRAMEWORK:
1. QUESTION every requirement — is this task actually necessary?
2. DELETE unnecessary tasks, meetings, reports
3. SIMPLIFY remaining workflows
4. ACCELERATE critical paths
5. AUTOMATE repeatable processes

TEAM MEMBERS:
${JSON.stringify(teamMembers.slice(0, 20), null, 2)}

PERIOD: ${period}
GOALS: ${JSON.stringify(goals)}
BENCHMARKS: ${JSON.stringify(benchmarks)}

Score each team member on 4 dimensions (0-100):
- Output Velocity (30% weight): Speed and volume of deliverables
- Quality (30% weight): Accuracy, thoroughness, impact
- Independence (20% weight): Self-direction, problem-solving
- Initiative (20% weight): Proactive improvements, anticipating needs

Classify: A (top performer), B (solid contributor), C (needs improvement)

Return JSON:
{
  "assessments": [
    {
      "name": string,
      "role": string,
      "scores": {
        "outputVelocity": number,
        "quality": number,
        "independence": number,
        "initiative": number,
        "composite": number
      },
      "tier": "A" | "B" | "C",
      "strengths": string[],
      "developmentAreas": string[],
      "recommendations": string[]
    }
  ],
  "elonAlgorithm": {
    "question": string[],
    "delete": string[],
    "simplify": string[],
    "accelerate": string[],
    "automate": string[]
  },
  "teamHealth": {
    "overallScore": number,
    "tierDistribution": { "A": number, "B": number, "C": number },
    "topRisks": string[],
    "quickWins": string[]
  }
}`;

  const raw = await routedCompletion({
    model: ModelPreset.LONG_FORM,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 6144,
    temperature: 0.3,
    systemPrompt: 'You are a COO and operations expert. Provide constructive, data-driven team assessments.',
  });

  let result: any;
  try {
    result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
  } catch {
    result = { raw };
  }

  try {
    await withTenantDb(tenantId, async (db) => {
      await db.insert(agentActions).values({
        tenantId,
        agentId: null,
        taskId: null,
        actionType: 'team_audit',
        category: 'operations',
        reasoning: `${period} team audit: ${teamMembers.length} members assessed. ${result.teamHealth?.tierDistribution?.A || 0}A / ${result.teamHealth?.tierDistribution?.B || 0}B / ${result.teamHealth?.tierDistribution?.C || 0}C.`,
        trigger: { source: 'team-ops', period },
        afterState: { overallScore: result.teamHealth?.overallScore, members: teamMembers.length },
        confidence: 0.7,
        impactMetric: 'team_audit',
        impactDelta: 1,
      });
    });
  } catch (e) {
    logger.warn('Failed to log team audit', { error: (e as Error).message });
  }

  return result;
}
