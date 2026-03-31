import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, redditMonitoredSubreddits, redditMentions, agentActions } from '@nexuszero/db';
import { eq, and, or } from 'drizzle-orm';
import { publishAgentTask, publishAgentSignal } from '@nexuszero/queue';
import { searchSubreddit, getPostComments } from '../reddit-client.js';
import { llmScoreMention } from '../llm.js';

export class SubredditScanHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;

    // 1. Load active monitored subreddits
    const monitored = await withTenantDb(tenantId, async (db) =>
      db.select().from(redditMonitoredSubreddits)
        .where(and(eq(redditMonitoredSubreddits.tenantId, tenantId), eq(redditMonitoredSubreddits.isActive, true))),
    );

    if (monitored.length === 0) {
      return { scanned: 0, message: 'No monitored subreddits configured' };
    }

    let totalMentions = 0;
    let totalEngageable = 0;

    for (const sub of monitored) {
      const keywords = (sub.keywords as string[]) ?? [];
      if (keywords.length === 0) continue;

      const query = keywords.join(' OR ');

      // 2. Search subreddit for posts
      const posts = await searchSubreddit(sub.subreddit, query, 25);

      for (const post of posts) {
        // 3. Check deduplication
        const existing = await withTenantDb(tenantId, async (db) =>
          db.select({ id: redditMentions.id }).from(redditMentions)
            .where(and(
              eq(redditMentions.tenantId, tenantId),
              eq(redditMentions.postId, post.id),
            )).limit(1),
        );
        if (existing.length > 0) continue;

        // 4. Score with LLM
        const mentionText = `${post.title}\n${post.selftext}`.slice(0, 1000);
        const brandContext = keywords[0] ?? sub.subreddit;
        const score = await llmScoreMention(mentionText, brandContext);

        // 5. Insert mention
        await withTenantDb(tenantId, async (db) =>
          db.insert(redditMentions).values({
            tenantId,
            subreddit: sub.subreddit,
            postId: post.id,
            postTitle: post.title.slice(0, 500),
            mentionText: mentionText.slice(0, 2000),
            postUrl: post.url,
            author: post.author,
            score: post.score,
            sentiment: score.sentiment,
            intent: score.intent,
            replyStatus: 'pending',
          }),
        );
        totalMentions++;

        // 6. Trigger draft reply for engaging mentions
        if (score.shouldEngage) {
          totalEngageable++;
          await publishAgentTask({
            agentType: 'reddit',
            tenantId,
            type: 'draft_reply',
            priority: 'medium',
            input: { postId: post.id, tenantId },
          });
        }
      }

      // Update lastScannedAt
      await withTenantDb(tenantId, async (db) =>
        db.update(redditMonitoredSubreddits)
          .set({ lastScannedAt: new Date() })
          .where(eq(redditMonitoredSubreddits.id, sub.id)),
      );
    }

    // 7. Signal if high-value mentions found
    if (totalEngageable > 0) {
      await publishAgentSignal({
        tenantId,
        type: 'reddit.mention_detected',
        agentId: 'reddit',
        data: { totalMentions, totalEngageable },
        priority: 'medium',
        confidence: 0.85,
      });
    }

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) =>
        db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'scan_subreddits',
          category: 'analysis',
          reasoning: `Scanned ${monitored.length} subreddits. Found ${totalMentions} new mentions, ${totalEngageable} engageable.`,
          trigger: { subreddits: monitored.map(s => s.subreddit) },
          afterState: { totalMentions, totalEngageable },
          confidence: 0.9,
          impactMetric: 'reddit_mentions_found',
          impactDelta: totalMentions,
        }),
      );
    } catch {
      // non-critical
    }

    return { subredditsScanned: monitored.length, totalMentions, totalEngageable };
  }
}
