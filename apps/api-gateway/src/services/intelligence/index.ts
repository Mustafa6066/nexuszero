/**
 * Customer Intelligence Orchestrator
 *
 * Runs all four intelligence layers in parallel and produces a unified
 * intelligence block that can be injected into the NexusAI system prompt.
 *
 * Layers:
 *  1. Customer Profile   — who the customer is
 *  2. Journey Awareness   — where they are in their lifecycle
 *  3. Behavioral Intel    — how they use the platform
 *  4. Proactive Guidance  — what to tell them next
 */

import { buildCustomerProfile, type CustomerProfile } from './customer-profile.js';
import { buildJourneyAwareness, type JourneyAwareness } from './journey-awareness.js';
import { buildBehavioralIntelligence, type BehavioralIntelligence } from './behavioral-intel.js';
import { buildProactiveGuidance, type ProactiveGuidance } from './proactive-guidance.js';

// ── Public types ───────────────────────────────────────────────────────────

export type { CustomerProfile } from './customer-profile.js';
export type { JourneyAwareness, JourneyPhase, FeatureAdoption, Milestone } from './journey-awareness.js';
export type { BehavioralIntelligence, EngagementLevel, SkillLevel, ToolUsageStat } from './behavioral-intel.js';
export type { ProactiveGuidance } from './proactive-guidance.js';

export interface CustomerIntelligence {
  profile: CustomerProfile;
  journey: JourneyAwareness;
  behavior: BehavioralIntelligence;
  guidance: ProactiveGuidance;
}

// ── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Build the full customer intelligence snapshot.
 *
 * Layers 1-3 run in parallel, then Layer 4 (proactive guidance)
 * synthesises their outputs.
 */
export async function buildCustomerIntelligence(
  tenantId: string,
  userId: string,
): Promise<CustomerIntelligence> {
  // Layers 1-3 are independent → parallel
  const [profile, journey, behavior] = await Promise.all([
    buildCustomerProfile(tenantId),
    buildJourneyAwareness(tenantId),
    buildBehavioralIntelligence(tenantId, userId),
  ]);

  // Layer 4 depends on the first three
  const guidance = await buildProactiveGuidance(tenantId, profile, journey, behavior);

  return { profile, journey, behavior, guidance };
}

// ── Prompt serialiser ──────────────────────────────────────────────────────

/**
 * Converts a CustomerIntelligence snapshot into a system-prompt section
 * that NexusAI can use to personalise every response.
 */
export function renderIntelligencePrompt(intel: CustomerIntelligence): string {
  const { profile, journey, behavior, guidance } = intel;
  const sections: string[] = [];

  // ── 1. Customer Profile ──
  sections.push(`## Customer Intelligence

### Profile
- Plan: ${profile.tier} | Tenure: ${profile.platformTenureDays} days | Team: ${profile.teamSize} member(s)
- Marketing maturity: ${profile.maturity} | Budget scale: ${profile.budgetScale}
- Campaigns: ${profile.totalCampaigns} total (${profile.activeCampaigns} active) | Creatives: ${profile.totalCreatives}
- Active channels: ${profile.campaignTypes.join(', ') || 'none yet'}
- Ad platforms: ${profile.activePlatforms.join(', ') || 'none yet'}
- Integrations: ${profile.connectedIntegrations.join(', ') || 'none connected'}
- 30-day spend: $${profile.recentSpend.toFixed(0)} | Revenue: $${profile.recentRevenue.toFixed(0)} | Best ROAS: ${profile.bestRoas.toFixed(2)}`);

  // ── 2. Journey Awareness ──
  const adoptedList = journey.featureAdoption.filter((f) => f.adopted).map((f) => f.feature);
  const notAdopted = journey.featureAdoption.filter((f) => !f.adopted).map((f) => f.feature);
  const achievedMilestones = journey.milestones.filter((m) => m.achieved).map((m) => m.name);

  sections.push(`### Journey
- Phase: **${journey.journeyPhase}** | Onboarding: ${journey.onboardingProgress}%${journey.daysSinceFirstActivity != null ? ` | Active for ${journey.daysSinceFirstActivity} days` : ''}
- Features adopted: ${adoptedList.join(', ') || 'none'}
- Not yet explored: ${notAdopted.join(', ') || 'all adopted'}
- Milestones achieved: ${achievedMilestones.join(', ') || 'none yet'}
- Recommended next actions: ${journey.nextActions.map((a, i) => `${i + 1}. ${a}`).join(' ')}`);

  // ── 3. Behavioral Intelligence ──
  sections.push(`### Behavior (last 30 days)
- Engagement: ${behavior.engagementLevel} | Skill level: ${behavior.skillLevel}
- Sessions: ${behavior.recentSessions} | Messages: ${behavior.recentMessages} | Avg/session: ${behavior.avgMessagesPerSession}${behavior.preferredTime ? ` | Preferred time: ${behavior.preferredTime}` : ''}
- Focus areas: ${behavior.focusAreas.join(', ') || 'none observed'}${behavior.topTools.length > 0 ? `\n- Top tools: ${behavior.topTools.slice(0, 5).map((t) => `${t.tool}(${t.count})`).join(', ')}` : ''}${behavior.painPoints.length > 0 ? `\n- Pain points: ${behavior.painPoints.join('; ')}` : ''}`);

  // ── 4. Proactive Guidance ──
  const guidanceLines: string[] = [];

  if (guidance.healthWarnings.length > 0) {
    guidanceLines.push('**Health Warnings** (mention early if relevant to the conversation):');
    for (const w of guidance.healthWarnings) guidanceLines.push(`- ${w}`);
  }
  if (guidance.performanceAlerts.length > 0) {
    guidanceLines.push('**Performance Alerts** (bring up when discussing campaigns or analytics):');
    for (const a of guidance.performanceAlerts) guidanceLines.push(`- ${a}`);
  }
  if (guidance.featureDiscovery.length > 0) {
    guidanceLines.push('**Feature Discovery** (weave in naturally when the topic fits):');
    for (const f of guidance.featureDiscovery) guidanceLines.push(`- ${f}`);
  }
  if (guidance.tips.length > 0) {
    guidanceLines.push('**Interaction Tips**:');
    for (const t of guidance.tips) guidanceLines.push(`- ${t}`);
  }

  if (guidanceLines.length > 0) {
    sections.push(`### Proactive Guidance\n${guidanceLines.join('\n')}`);
  }

  // ── Communication style as final instruction ──
  if (guidance.communicationStyle) {
    sections.push(`### Communication Style\n${guidance.communicationStyle}`);
  }

  return sections.join('\n\n');
}
