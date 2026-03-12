/**
 * Agent Activator — Determines which agents to activate based on connected integrations adn activates them.
 */

import type { Platform } from '@nexuszero/shared';
import { eq } from 'drizzle-orm';
import { getDb, agents } from '@nexuszero/db';

/** Map of platforms to the agents that need them */
const PLATFORM_AGENT_MAP: Record<string, string[]> = {
  google_analytics: ['seo', 'data-nexus'],
  google_ads: ['ad'],
  google_search_console: ['seo', 'aeo'],
  meta_ads: ['ad'],
  linkedin_ads: ['ad'],
  hubspot: ['data-nexus'],
  salesforce: ['data-nexus'],
  wordpress: ['seo', 'aeo'],
  webflow: ['seo', 'aeo'],
  contentful: ['seo', 'aeo'],
  shopify: ['seo', 'ad', 'data-nexus'],
  mixpanel: ['data-nexus'],
  amplitude: ['data-nexus'],
  slack: [],
  sendgrid: [],
  stripe_connect: ['data-nexus'],
};

export interface ActivationPlan {
  agentsToActivate: string[];
  platformCoverage: Record<string, Platform[]>;
}

/** Determine which agents to activate based on connected platforms */
export function planAgentActivation(connectedPlatforms: Platform[]): ActivationPlan {
  const agentSet = new Set<string>();
  const coverage: Record<string, Platform[]> = {};

  for (const platform of connectedPlatforms) {
    const associatedAgents = PLATFORM_AGENT_MAP[platform] ?? [];
    for (const agent of associatedAgents) {
      agentSet.add(agent);
      if (!coverage[agent]) coverage[agent] = [];
      coverage[agent]!.push(platform);
    }
  }

  // Always include compatibility agent
  agentSet.add('compatibility');

  return {
    agentsToActivate: Array.from(agentSet),
    platformCoverage: coverage,
  };
}

/** Activate agents for a tenant in the database */
export async function activateAgents(
  tenantId: string,
  connectedPlatforms: Platform[],
): Promise<string[]> {
  const plan = planAgentActivation(connectedPlatforms);
  const db = getDb();

  // Check which agents already exist for this tenant
  const existingAgents = await db
    .select({ type: agents.type })
    .from(agents)
    .where(eq(agents.tenantId, tenantId));

  const existingTypes = new Set(existingAgents.map((a: { type: string | null }) => a.type));
  const newAgents = plan.agentsToActivate.filter((a) => !existingTypes.has(a as any));

  // Create new agent records
  for (const agentType of newAgents) {
    await db.insert(agents).values({
      tenantId,
      type: agentType as any,
      status: 'idle',
      metadata: {},
    });
  }

  return plan.agentsToActivate;
}
