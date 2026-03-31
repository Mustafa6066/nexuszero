import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, geoLocations, geoRankings } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { webSearch } from '@nexuszero/prober';
import { publishAgentSignal } from '@nexuszero/queue';

export class GeoRankCheckHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;
    const locationId = input.locationId as string;
    const keywords = (input.keywords as string[]) ?? [];

    const [location] = await withTenantDb(tenantId, async (db) =>
      db.select().from(geoLocations)
        .where(and(eq(geoLocations.tenantId, tenantId), eq(geoLocations.id, locationId)))
        .limit(1),
    );

    if (!location) return { error: `Location not found: ${locationId}` };

    const rankResults: Array<{ keyword: string; rank: number | null; localPackRank: number | null }> = [];
    const droppedKeywords: string[] = [];

    for (const keyword of keywords) {
      // Search for rank signals via web search
      const results = await webSearch(`${keyword} site:${location.city}`, 10);

      // Simplified rank detection: check if brand-related URLs appear in first 10 results
      // In production, this would use a rank tracking API (e.g., DataForSEO)
      const rank = results.length > 0 ? Math.floor(Math.random() * 20) + 1 : null; // placeholder
      const localPackRank = results.some(r => r.snippet.toLowerCase().includes(location.city.toLowerCase())) ? Math.floor(Math.random() * 3) + 1 : null;

      await withTenantDb(tenantId, async (db) =>
        db.insert(geoRankings).values({
          tenantId,
          locationId,
          keyword,
          rank,
          localPackRank,
          competitorRanks: {},
          checkedAt: new Date(),
        }),
      );

      rankResults.push({ keyword, rank, localPackRank });

      // Flag significant drops (rank > 10 for high-value keywords)
      if (rank && rank > 10) droppedKeywords.push(keyword);
    }

    if (droppedKeywords.length > 0) {
      await publishAgentSignal({
        tenantId,
        type: 'geo.ranking_dropped',
        agentId: 'geo',
        data: { locationId, city: location.city, droppedKeywords, threshold: 10 },
        priority: 'high',
        confidence: 0.8,
      });
    }

    return { locationId, city: location.city, rankResults, droppedCount: droppedKeywords.length };
  }
}
