import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, geoLocations, integrations } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { proposeCmsChange } from '@nexuszero/queue';
import { llmGenerateLocalSchema } from '../llm.js';

export class GeoSchemaHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;

    const locations = await withTenantDb(tenantId, async (db) =>
      db.select().from(geoLocations)
        .where(eq(geoLocations.tenantId, tenantId)),
    );

    const activeLocations = locations.filter(l => l.isActive);
    if (activeLocations.length === 0) return { message: 'No active locations' };

    // Find active CMS integration
    const [cmsIntegration] = await withTenantDb(tenantId, async (db) =>
      db.select().from(integrations)
        .where(and(eq(integrations.tenantId, tenantId), eq(integrations.status, 'active')))
        .limit(1),
    );

    if (!cmsIntegration) return { error: 'No active CMS integration for schema push' };

    const results: Array<{ locationId: string; changeId: string }> = [];

    for (const location of activeLocations) {
      const schemaJson = await llmGenerateLocalSchema(location);

      const jsonLd = `<script type="application/ld+json">\n${JSON.stringify(schemaJson, null, 2)}\n</script>`;

      const { changeId } = await proposeCmsChange({
        tenantId,
        integrationId: cmsIntegration.id,
        platform: cmsIntegration.platform,
        resourceType: 'page',
        resourceId: `geo-${location.id}`,
        scope: 'schema',
        proposedBy: 'geo',
        afterState: { jsonLd, schemaJson },
        changeDescription: `LocalBusiness schema for ${location.name} (${location.city}, ${location.country})`,
      });

      results.push({ locationId: location.id, changeId });
    }

    return { schemasGenerated: results.length, results };
  }
}
