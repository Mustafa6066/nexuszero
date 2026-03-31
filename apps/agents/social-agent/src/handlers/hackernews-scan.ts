import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, socialMentions, socialListeningConfig } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmScoreSocialMention } from '../llm.js';

interface HNHit {
  objectID: string;
  title?: string;
  comment_text?: string;
  author: string;
  url?: string;
  story_url?: string;
  points?: number;
  created_at: string;
}

async function searchHN(query: string): Promise<HNHit[]> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=comment,story&hitsPerPage=30`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json() as { hits?: HNHit[] };
  return data.hits ?? [];
}

export class HackerNewsScanHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;

    const configs = await withTenantDb(tenantId, async (db) =>
      db.select().from(socialListeningConfig)
        .where(and(
          eq(socialListeningConfig.tenantId, tenantId),
          eq(socialListeningConfig.platform, 'hackernews'),
          eq(socialListeningConfig.isActive, true),
        )),
    );

    if (configs.length === 0) return { scanned: 0, message: 'No HN listening config' };

    let totalFound = 0;

    for (const config of configs) {
      const keywords = (config.keywords as string[]) ?? [];

      for (const keyword of keywords) {
        const hits = await searchHN(keyword);

        for (const hit of hits) {
          const existing = await withTenantDb(tenantId, async (db) =>
            db.select({ id: socialMentions.id }).from(socialMentions)
              .where(and(eq(socialMentions.tenantId, tenantId), eq(socialMentions.externalId, hit.objectID)))
              .limit(1),
          );
          if (existing.length > 0) continue;

          const content = hit.comment_text || hit.title || '';
          if (!content) continue;

          const score = await llmScoreSocialMention(content, 'hackernews', keywords);

          await withTenantDb(tenantId, async (db) =>
            db.insert(socialMentions).values({
              tenantId,
              platform: 'hackernews',
              externalId: hit.objectID,
              authorHandle: hit.author,
              content: content.slice(0, 2000),
              url: hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
              sentiment: score.sentiment,
              intent: score.intent,
              engagementScore: score.engagementScore,
              replyStatus: 'monitor', // HN — monitoring only, no bot posting
            }),
          );
          totalFound++;
        }
      }

      await withTenantDb(tenantId, async (db) =>
        db.update(socialListeningConfig)
          .set({ lastScannedAt: new Date() })
          .where(eq(socialListeningConfig.id, config.id)),
      );
    }

    if (totalFound > 0) {
      await publishAgentSignal({
        tenantId, type: 'social.mention_detected', agentId: 'social',
        data: { platform: 'hackernews', totalFound }, priority: 'low', confidence: 0.8,
      });
    }

    return { platform: 'hackernews', totalFound };
  }
}
