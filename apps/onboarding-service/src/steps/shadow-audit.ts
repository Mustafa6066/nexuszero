import { getDb, tenants, users } from '@nexuszero/db';
import { eq } from 'drizzle-orm';

/**
 * Shadow Audit Step
 * Runs automatically on tenant creation BEFORE the user reaches the dashboard.
 * Extracts the domain from the creator's email, runs a lightweight preflight scan,
 * and stores results so the first screen shows "We already audited your domain."
 */

/** Lightweight domain scan — inlined to avoid cross-service import */
async function scanDomain(domain: string): Promise<Record<string, unknown>> {
  // If the API gateway is reachable, delegate to its /scanner endpoint
  const gatewayUrl = process.env.API_GATEWAY_URL || 'http://localhost:4000';
  try {
    const response = await fetch(`${gatewayUrl}/api/v1/scanner/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: domain }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) {
      return await response.json() as Record<string, unknown>;
    }
  } catch {
    // Gateway not reachable — fall through to minimal scan
  }

  // Minimal fallback: just check if the domain is reachable
  try {
    const res = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    return {
      domain,
      scannedUrl: `https://${domain}`,
      scannedAt: new Date().toISOString(),
      readinessScore: res.ok ? 50 : 10,
      detectedTech: [],
      connectablePlatforms: [],
      recommendedAgents: ['seo', 'ad', 'aeo', 'data_nexus'],
      seo: {},
      reachable: res.ok,
    };
  } catch {
    return {
      domain,
      readinessScore: 0,
      detectedTech: [],
      connectablePlatforms: [],
      recommendedAgents: ['seo', 'ad', 'aeo', 'data_nexus'],
      reachable: false,
    };
  }
}

export class ShadowAuditStep {
  async execute(tenantId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = getDb();

    const [tenant] = await db
      .select({ id: tenants.id, domain: tenants.domain, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw new Error('Tenant not found');

    // 1. Resolve the domain — prefer tenant.domain, fall back to email domain
    let domain = tenant.domain;

    if (!domain) {
      const [creator] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.tenantId, tenantId))
        .limit(1);

      if (creator?.email) {
        const emailDomain = creator.email.split('@')[1];
        // Skip generic email providers — these don't map to a scannable corporate site
        const genericProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'protonmail.com', 'aol.com'];
        if (emailDomain && !genericProviders.includes(emailDomain.toLowerCase())) {
          domain = emailDomain;
        }
      }
    }

    if (!domain) {
      // No scannable domain — skip audit, return minimal results
      return {
        skipped: true,
        reason: 'no_corporate_domain',
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Run the preflight scan
    const scanResult = await scanDomain(domain);

    // 3. Store the shadow audit results in tenant settings
    await db.update(tenants).set({
      domain: tenant.domain ?? domain, // Persist inferred domain if none was set
      settings: {
        shadowAudit: {
          scanResult,
          scannedDomain: domain,
          completedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    return {
      domain,
      readinessScore: scanResult.readinessScore,
      detectedTech: scanResult.detectedTech,
      connectablePlatforms: scanResult.connectablePlatforms,
      recommendedAgents: scanResult.recommendedAgents,
      seo: scanResult.seo,
      timestamp: new Date().toISOString(),
    };
  }
}
