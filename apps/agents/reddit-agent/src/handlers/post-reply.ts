import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, redditMentions } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { publishAgentSignal } from '@nexuszero/queue';

export class PostReplyHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;
    const mentionId = input.mentionId as string;

    if (!mentionId) return { error: 'mentionId is required' };

    const accessToken = process.env.REDDIT_ACCESS_TOKEN;
    if (!accessToken) {
      return { error: 'REDDIT_ACCESS_TOKEN not configured — cannot post replies' };
    }

    // 1. Load the approved mention
    const [mention] = await withTenantDb(tenantId, async (db) =>
      db.select().from(redditMentions)
        .where(and(eq(redditMentions.tenantId, tenantId), eq(redditMentions.id, mentionId)))
        .limit(1),
    );

    if (!mention) return { error: `Mention not found: ${mentionId}` };
    if (!mention.draftReply) return { error: 'No draft reply to post' };
    if (mention.replyStatus !== 'approved') return { error: 'Mention not approved for posting' };

    // 2. Post reply to Reddit via OAuth
    const res = await fetch('https://oauth.reddit.com/api/comment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': process.env.REDDIT_USER_AGENT || 'NexusZero/1.0',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        api_type: 'json',
        thing_id: mention.postId,
        text: mention.draftReply,
      }).toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[reddit] Post reply failed ${res.status}: ${body}`);
      return { error: `Reddit API error: ${res.status}` };
    }

    // 3. Update mention status
    await withTenantDb(tenantId, async (db) =>
      db.update(redditMentions)
        .set({ replyStatus: 'posted', postedAt: new Date() })
        .where(eq(redditMentions.id, mentionId)),
    );

    await publishAgentSignal({
      tenantId,
      type: 'reddit.reply_posted',
      agentId: 'reddit',
      data: { mentionId, subreddit: mention.subreddit, postId: mention.postId },
      priority: 'low',
      confidence: 1.0,
    });

    return { mentionId, posted: true };
  }
}
