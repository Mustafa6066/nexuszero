/**
 * Agent Activator — Determines which agents to activate based on connected integrations and activates them.
 * Now supports dynamic (AI-discovered) platforms via category-based agent mapping.
 */

import type { Platform } from '@nexuszero/shared';
import { eq } from 'drizzle-orm';
import { getDb, agents } from '@nexuszero/db';
import { getBlueprint } from '../intelligence/platform-knowledge.js';

/** Map of native platforms to the agents that need them */
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

/** Category-based mapping for dynamic platforms */
const CATEGORY_AGENT_MAP: Record<string, string[]> = {
  analytics: ['data-nexus'],
  ads: ['ad'],
  crm: ['data-nexus'],
  cms: ['seo', 'aeo'],
  seo: ['seo', 'aeo'],
  messaging: [],
  payments: ['data-nexus'],
  social: ['ad', 'data-nexus'],
  ecommerce: ['seo', 'ad', 'data-nexus'],
  devtools: ['data-nexus'],
  other: ['data-nexus'],
};

export interface ActivationPlan {
  agentsToActivate: string[];
  platformCoverage: Record<string, Platform[]>;
}

/** Determine which agents to activate based on connected platforms (native + dynamic) */
export function planAgentActivation(connectedPlatforms: Platform[]): ActivationPlan {
  const agentSet = new Set<string>();
  const coverage: Record<string, Platform[]> = {};

  for (const platform of connectedPlatforms) {
    // Try native mapping first
    let associatedAgents = PLATFORM_AGENT_MAP[platform];

    // If not a native platform, look up its category from knowledge base
    if (!associatedAgents) {
      // Synchronous check — getBlueprint is async, so we use category fallback
      associatedAgents = CATEGORY_AGENT_MAP['other'] ?? [];
    }

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

/** Determine agents for dynamic platforms using their category from the knowledge base */
export async function planAgentActivationAsync(connectedPlatforms: Platform[]): Promise<ActivationPlan> {
  const agentSet = new Set<string>();
  const coverage: Record<string, Platform[]> = {};

  for (const platform of connectedPlatforms) {
    let associatedAgents = PLATFORM_AGENT_MAP[platform];

    if (!associatedAgents) {
      // Look up dynamic platform category
      const blueprint = await getBlueprint(platform);
      const category = blueprint?.category ?? 'other';
      associatedAgents = CATEGORY_AGENT_MAP[category] ?? CATEGORY_AGENT_MAP['other'] ?? [];
    }

    for (const agent of associatedAgents) {
      agentSet.add(agent);
      if (!coverage[agent]) coverage[agent] = [];
      coverage[agent]!.push(platform);
    }
  }

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
