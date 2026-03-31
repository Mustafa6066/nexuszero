import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, geoLocations, geoCitations, tenants } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { webSearch } from '@nexuszero/prober';
import { publishAgentSignal } from '@nexuszero/queue';

const DIRECTORIES = [
  { name: 'yelp', searchSuffix: 'site:yelp.com' },
  { name: 'tripadvisor', searchSuffix: 'site:tripadvisor.com' },
  { name: 'yellowpages', searchSuffix: 'site:yellowpages.com' },
  { name: 'google_maps', searchSuffix: 'maps.google.com' },
];

export class GeoCitationHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;

    // Get tenant brand name
    const [tenant] = await withTenantDb(tenantId, async (db) =>
      db.select({ settings: tenants.settings, name: tenants.name }).from(tenants)
        .where(eq(tenants.id, tenantId)).limit(1),
    );

    const brandName = (tenant?.settings as Record<string, unknown>)?.brandName as string ?? tenant?.name ?? '';
    const expectedPhone = (tenant?.settings as Record<string, unknown>)?.phone as string ?? '';
    const expectedAddress = (tenant?.settings as Record<string, unknown>)?.address as string ?? '';

    const locations = await withTenantDb(tenantId, async (db) =>
      db.select().from(geoLocations)
        .where(eq(geoLocations.tenantId, tenantId)),
    );

    let issueCount = 0;

    for (const location of locations.filter(l => l.isActive)) {
      for (const dir of DIRECTORIES) {
        // Search for brand in this directory
        const results = await webSearch(`"${brandName}" ${location.city} ${dir.searchSuffix}`, 3);

        const found = results.length > 0;
        const issues: string[] = [];

        if (!found) {
          issues.push(`Not listed in ${dir.name} for ${location.city}`);
          issueCount++;
        }

        await withTenantDb(tenantId, async (db) =>
          db.insert(geoCitations).values({
            tenantId,
            directory: dir.name,
            url: results[0]?.url ?? '',
            napConsistent: found ? null : false, // null = not checked (not found), false = inconsistent
            issues,
            lastCheckedAt: new Date(),
          }).onConflictDoNothing(),
        );
      }
    }

    if (issueCount > 0) {
      await publishAgentSignal({
        tenantId,
        type: 'geo.citation_issue',
        agentId: 'geo',
        data: { issueCount, brand: brandName },
        priority: 'medium',
        confidence: 0.85,
      });
    }

    return { locationsAudited: locations.filter(l => l.isActive).length, issueCount };
  }
}
