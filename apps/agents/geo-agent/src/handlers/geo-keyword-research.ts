import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, geoLocations } from '@nexuszero/db';
import { eq } from 'drizzle-orm';
import { webSearch } from '@nexuszero/prober';
import { publishAgentTask } from '@nexuszero/queue';
import { llmAnalyzeLocalKeywords } from '../llm.js';

export class GeoKeywordHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;
    const service = (input.service as string) ?? '';

    // 1. Load active locations
    const locations = await withTenantDb(tenantId, async (db) =>
      db.select().from(geoLocations)
        .where(eq(geoLocations.tenantId, tenantId)),
    );

    if (locations.length === 0) return { message: 'No locations configured' };

    const allResults: Array<{ locationId: string; city: string; keywords: unknown[] }> = [];

    for (const loc of locations.filter(l => l.isActive)) {
      // 2. Web search for local keywords
      const query = `best ${service || 'business'} in ${loc.city} ${loc.country}`;
      const results = await webSearch(query, 8);

      // Extract search terms from result titles/snippets
      const rawKeywords = results.flatMap(r => [
        `${service} ${loc.city}`,
        `${service} near me ${loc.city}`,
        `${service} ${loc.city} ${loc.country}`,
        r.title.slice(0, 50),
      ]);

      const deduped = [...new Set(rawKeywords)];

      // 3. LLM cluster and prioritize
      const { clustered } = await llmAnalyzeLocalKeywords(deduped, loc.city, service || 'business');
      allResults.push({ locationId: loc.id, city: loc.city, keywords: clustered });

      // 4. Trigger rank check for high-priority keywords
      const highPriority = clustered.filter(k => k.priority === 'high').map(k => k.keyword);
      if (highPriority.length > 0) {
        await publishAgentTask({
          agentType: 'geo',
          tenantId,
          type: 'geo_rank_check',
          priority: 'medium',
          input: { locationId: loc.id, keywords: highPriority },
        });
      }

      // 5. Trigger content writer for local blog posts
      if (highPriority.length > 0) {
        await publishAgentTask({
          agentType: 'content-writer',
          tenantId,
          type: 'write_blog_post',
          priority: 'low',
          input: {
            brief: {
              topic: `${service} in ${loc.city}: Complete Guide`,
              tone: 'informative',
              keywords: highPriority.slice(0, 5),
              wordCount: 1200,
            },
            useWebSearch: true,
          },
        });
      }
    }

    return { locationsProcessed: locations.filter(l => l.isActive).length, results: allResults };
  }
}
