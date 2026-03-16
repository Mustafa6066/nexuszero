import { getDb, tenants } from '@nexuszero/db';
import { eq } from 'drizzle-orm';

/**
 * Firmographic Enrichment Step
 * Uses LLM inference to deduce industry, company size, likely goals, and
 * recommended channels from the domain + shadow audit results — eliminating
 * the need to ask the user "What are your goals?" during onboarding.
 */

export interface FirmographicProfile {
  industry: string;
  companySize: 'startup' | 'smb' | 'mid_market' | 'enterprise';
  businessModel: 'b2b' | 'b2c' | 'b2b2c' | 'marketplace' | 'agency' | 'unknown';
  likelyGoals: string[];
  recommendedChannels: string[];
  inferredBudgetRange: 'minimal' | 'moderate' | 'significant' | 'enterprise';
  confidence: number;
}

const DEFAULT_PROFILE: FirmographicProfile = {
  industry: 'general',
  companySize: 'smb',
  businessModel: 'unknown',
  likelyGoals: ['brand_awareness', 'lead_generation'],
  recommendedChannels: ['seo', 'paid_search', 'social'],
  inferredBudgetRange: 'moderate',
  confidence: 0.2,
};

export class FirmographicEnrichmentStep {
  async execute(tenantId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = getDb();

    const [tenant] = await db
      .select({ id: tenants.id, domain: tenants.domain, name: tenants.name, metadata: tenants.metadata })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw new Error('Tenant not found');

    const shadowAudit = (tenant.metadata as Record<string, unknown>)?.shadowAudit as Record<string, unknown> | undefined;
    const domain = tenant.domain ?? (config.domain as string | undefined);

    // Build the enrichment profile via LLM
    const profile = await this.inferProfile(domain, tenant.name, shadowAudit);

    // Merge firmographic profile into tenant metadata
    const existingMetadata = (tenant.metadata ?? {}) as Record<string, unknown>;
    await db.update(tenants).set({
      metadata: {
        ...existingMetadata,
        firmographicProfile: profile,
      },
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    return {
      firmographicProfile: profile,
      timestamp: new Date().toISOString(),
    };
  }

  private async inferProfile(
    domain: string | null,
    companyName: string,
    shadowAudit: Record<string, unknown> | undefined,
  ): Promise<FirmographicProfile> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || !domain) {
      return DEFAULT_PROFILE;
    }

    const scanSummary = shadowAudit
      ? JSON.stringify({
          readinessScore: (shadowAudit.scanResult as Record<string, unknown>)?.readinessScore,
          detectedTech: (shadowAudit.scanResult as Record<string, unknown>)?.detectedTech,
          seo: (shadowAudit.scanResult as Record<string, unknown>)?.seo,
        })
      : 'No scan data available';

    const prompt = `Analyze this company and provide a firmographic profile.

Domain: ${domain}
Company Name: ${companyName}
Website Scan Summary: ${scanSummary}

Based on the domain, company name, and any detected technology, infer:
1. Industry (e.g., "B2B SaaS", "E-commerce", "Healthcare", "FinTech", "Agency", "Education")
2. Company size: "startup", "smb", "mid_market", or "enterprise"
3. Business model: "b2b", "b2c", "b2b2c", "marketplace", "agency", or "unknown"
4. Top 3 likely marketing goals from: lead_generation, roas_optimization, brand_awareness, customer_acquisition, retention, content_marketing, local_seo
5. Top 4 recommended channels from: seo, paid_search, social_ads, content, email, display, video, affiliate
6. Inferred monthly budget range: "minimal" (<$1K), "moderate" ($1-10K), "significant" ($10-50K), "enterprise" ($50K+)
7. Confidence score 0-1

Return ONLY valid JSON: {"industry":"...","companySize":"...","businessModel":"...","likelyGoals":["..."],"recommendedChannels":["..."],"inferredBudgetRange":"...","confidence":0.X}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) return DEFAULT_PROFILE;

      const body = await response.json() as { content?: { type: string; text: string }[] };
      const text = body.content?.[0]?.type === 'text' ? body.content[0].text : '';
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned) as FirmographicProfile;

      // Validate required fields exist
      if (!parsed.industry || !parsed.companySize || !parsed.likelyGoals) {
        return DEFAULT_PROFILE;
      }

      return parsed;
    } catch {
      return DEFAULT_PROFILE;
    }
  }
}
