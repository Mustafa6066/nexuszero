import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, socialMentions, socialListeningConfig } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { publishAgentTask, publishAgentSignal } from '@nexuszero/queue';
import { llmScoreSocialMention } from '../llm.js';

interface TwitterTweet {
  id: string;
  text: string;
  authorId: string;
  authorUsername?: string;
  publicMetrics?: { follower_count?: number; retweet_count?: number; like_count?: number };
  createdAt?: string;
}

async function searchRecentTweets(query: string, maxResults = 50): Promise<TwitterTweet[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    console.warn('[twitter] TWITTER_BEARER_TOKEN not configured');
    return [];
  }

  const url = new URL('https://api.twitter.com/2/tweets/search/recent');
  url.searchParams.set('query', `${query} -is:retweet lang:en`);
  url.searchParams.set('max_results', String(Math.min(maxResults, 100)));
  url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id');
  url.searchParams.set('expansions', 'author_id');
  url.searchParams.set('user.fields', 'username,public_metrics');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });

  if (!res.ok) {
    console.warn(`[twitter] Search error ${res.status}: ${await res.text()}`);
    return [];
  }

  const data = await res.json() as {
    data?: Array<{ id: string; text: string; author_id: string; created_at?: string; public_metrics?: { retweet_count?: number; like_count?: number } }>;
    includes?: { users?: Array<{ id: string; username: string; public_metrics?: { followers_count?: number } }> };
  };

  const usersMap = new Map((data.includes?.users ?? []).map(u => [u.id, u]));

  return (data.data ?? []).map(t => {
    const user = usersMap.get(t.author_id);
    return {
      id: t.id,
      text: t.text,
      authorId: t.author_id,
      authorUsername: user?.username,
      publicMetrics: {
        follower_count: user?.public_metrics?.followers_count,
        retweet_count: t.public_metrics?.retweet_count,
        like_count: t.public_metrics?.like_count,
      },
      createdAt: t.created_at,
    };
  });
}

export class TwitterScanHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;

    const configs = await withTenantDb(tenantId, async (db) =>
      db.select().from(socialListeningConfig)
        .where(and(
          eq(socialListeningConfig.tenantId, tenantId),
          eq(socialListeningConfig.platform, 'twitter'),
          eq(socialListeningConfig.isActive, true),
        )),
    );

    if (configs.length === 0) return { scanned: 0, message: 'No Twitter listening config' };

    let totalFound = 0;
    let totalEngageable = 0;

    for (const config of configs) {
      const keywords = (config.keywords as string[]) ?? [];
      if (keywords.length === 0) continue;

      const query = keywords.map(k => `"${k}"`).join(' OR ');
      const tweets = await searchRecentTweets(query);

      for (const tweet of tweets) {
        // Dedup
        const existing = await withTenantDb(tenantId, async (db) =>
          db.select({ id: socialMentions.id }).from(socialMentions)
            .where(and(eq(socialMentions.tenantId, tenantId), eq(socialMentions.externalId, tweet.id)))
            .limit(1),
        );
        if (existing.length > 0) continue;

        const score = await llmScoreSocialMention(tweet.text, 'twitter', keywords);
        const followerCount = tweet.publicMetrics?.follower_count ?? 0;
        const engagementScore = score.engagementScore * (followerCount > 10000 ? 1.5 : followerCount > 1000 ? 1.2 : 1);

        await withTenantDb(tenantId, async (db) =>
          db.insert(socialMentions).values({
            tenantId,
            platform: 'twitter',
            externalId: tweet.id,
            authorHandle: tweet.authorUsername ?? tweet.authorId,
            content: tweet.text,
            url: `https://twitter.com/i/web/status/${tweet.id}`,
            sentiment: score.sentiment,
            intent: score.intent,
            engagementScore: Math.min(1, engagementScore),
            replyStatus: 'monitor',
          }),
        );
        totalFound++;

        // High-engagement mentions get draft reply
        if (score.shouldEngage && followerCount > 1000) {
          totalEngageable++;
          await publishAgentTask({
            agentType: 'social',
            tenantId,
            type: 'draft_social_reply',
            priority: 'medium',
            input: { externalId: tweet.id, platform: 'twitter', tenantId },
          });
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
        data: { platform: 'twitter', totalFound, totalEngageable }, priority: 'low', confidence: 0.85,
      });
    }

    return { platform: 'twitter', totalFound, totalEngageable };
  }
}
