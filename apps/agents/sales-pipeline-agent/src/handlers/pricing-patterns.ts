import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { llmAnalyzeSales } from '../llm.js';

/**
 * Pricing Pattern Library Handler
 *
 * 10 proven value-based pricing patterns with LLM-powered
 * scenario recommendations and competitive positioning.
 *
 * Ported from: ai-marketing-skills/sales-playbook
 */

const PRICING_PATTERNS = [
  {
    id: 'anchor_with_data',
    name: 'Anchor With Data',
    description: 'Lead with industry data showing the cost of inaction, then position your price as a fraction of the problem cost.',
    bestFor: ['high-ticket B2B', 'consulting', 'enterprise SaaS'],
  },
  {
    id: 'tiered_packaging',
    name: 'Tiered Packaging',
    description: 'Structure 3 tiers (Good/Better/Best) where the middle tier is the target. Decoy pricing to push toward desired option.',
    bestFor: ['SaaS', 'productized services', 'e-commerce'],
  },
  {
    id: 'competitive_ego_trigger',
    name: 'Competitive Ego Trigger',
    description: 'Show what competitors are spending/achieving, triggering loss aversion and competitive drive.',
    bestFor: ['competitive markets', 'agencies', 'marketing services'],
  },
  {
    id: 'roi_calculator',
    name: 'ROI Calculator',
    description: 'Build a simple ROI model showing payback period. Frame price as an investment with measurable returns.',
    bestFor: ['performance marketing', 'automation tools', 'productivity SaaS'],
  },
  {
    id: 'loss_aversion_frame',
    name: 'Loss Aversion Frame',
    description: 'Calculate what they lose each month without the solution. "Every month without X costs you $Y."',
    bestFor: ['compliance', 'security', 'revenue recovery'],
  },
  {
    id: 'value_stacking',
    name: 'Value Stacking',
    description: 'List every deliverable individually priced, then show the bundle discount. Makes the package feel like a bargain.',
    bestFor: ['agencies', 'course bundles', 'service packages'],
  },
  {
    id: 'reverse_trial',
    name: 'Reverse Trial',
    description: 'Start with premium features, auto-downgrade to free. Users experience full value first, creating loss aversion.',
    bestFor: ['SaaS', 'tools', 'platforms'],
  },
  {
    id: 'performance_based',
    name: 'Performance-Based Pricing',
    description: 'Base fee + success fee tied to measurable outcomes. Aligns incentives and reduces perceived risk.',
    bestFor: ['marketing agencies', 'performance marketing', 'lead gen'],
  },
  {
    id: 'founding_member',
    name: 'Founding Member Lock-In',
    description: 'Offer a locked-in lower price to early customers. Creates urgency and locks in revenue with loyalty.',
    bestFor: ['new products', 'communities', 'membership sites'],
  },
  {
    id: 'comparative_framing',
    name: 'Comparative Framing',
    description: 'Compare price to everyday expenses. "Less than a coffee per day" or "Cost of one bad hire."',
    bestFor: ['consumer SaaS', 'B2B tools', 'insurance'],
  },
] as const;

export class PricingPatternHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      product,
      currentPricing = {},
      targetCustomer = {},
      competitors = [],
      salesChallenges = [],
      requestedPatterns = [],
    } = input;

    // Filter patterns if specific ones requested
    const patterns = requestedPatterns.length > 0
      ? PRICING_PATTERNS.filter(p => requestedPatterns.includes(p.id))
      : PRICING_PATTERNS;

    const prompt = `You are a value-based pricing strategist. Recommend and apply pricing patterns to this scenario.

PRODUCT: ${JSON.stringify(product)}
CURRENT PRICING: ${JSON.stringify(currentPricing)}
TARGET CUSTOMER: ${JSON.stringify(targetCustomer)}
COMPETITORS: ${JSON.stringify(competitors.slice(0, 5))}
SALES CHALLENGES: ${JSON.stringify(salesChallenges)}

AVAILABLE PRICING PATTERNS:
${patterns.map(p => `- ${p.name}: ${p.description} (Best for: ${p.bestFor.join(', ')})`).join('\n')}

For the top 3 most relevant patterns, provide:
1. Why it fits this scenario
2. Specific implementation with real numbers
3. Example sales talk track
4. Potential objections and handles

Return JSON:
{
  "recommendations": [
    {
      "patternId": string,
      "patternName": string,
      "fitScore": number,
      "rationale": string,
      "implementation": {
        "setup": string,
        "pricingStructure": any,
        "keyNumbers": Record<string, number | string>
      },
      "talkTrack": string,
      "objectionHandles": [{ "objection": string, "response": string }]
    }
  ],
  "combinedStrategy": string,
  "avoidPatterns": [{ "patternId": string, "reason": string }],
  "competitivePositioning": string
}`;

    const raw = await llmAnalyzeSales(prompt);
    await job.updateProgress(80);

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
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'pricing_pattern_recommend',
          category: 'sales',
          reasoning: `Recommended ${result.recommendations?.length || 0} pricing patterns for ${product?.name || 'product'}. Top: ${result.recommendations?.[0]?.patternName || 'N/A'}.`,
          trigger: { taskType: 'pricing_pattern_recommend' },
          afterState: { patterns: result.recommendations?.length || 0 },
          confidence: 0.75,
          impactMetric: 'pricing_recommendations',
          impactDelta: result.recommendations?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log pricing pattern:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { pricingPatterns: result, library: PRICING_PATTERNS, completedAt: new Date().toISOString() };
  }
}
