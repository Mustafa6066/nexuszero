import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, redditMentions, approvalQueue, tenants } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { llmDraftReply } from '../llm.js';

export class DraftReplyHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;
    const postId = input.postId as string;

    if (!postId) return { error: 'postId is required' };

    // 1. Load mention
    const [mention] = await withTenantDb(tenantId, async (db) =>
      db.select().from(redditMentions)
        .where(and(eq(redditMentions.tenantId, tenantId), eq(redditMentions.postId, postId)))
        .limit(1),
    );

    if (!mention) return { error: `Mention not found: ${postId}` };

    // 2. Load tenant brand voice
    const [tenant] = await withTenantDb(tenantId, async (db) =>
      db.select({ settings: tenants.settings }).from(tenants)
        .where(eq(tenants.id, tenantId)).limit(1),
    );
    const brandVoice = (tenant?.settings as Record<string, unknown>)?.brandVoice as string ?? 'helpful and professional';

    // 3. Draft reply
    const draft = await llmDraftReply(
      { postTitle: mention.postTitle, mentionText: mention.mentionText, subreddit: mention.subreddit },
      brandVoice,
    );

    // 4. Update mention with draft
    await withTenantDb(tenantId, async (db) =>
      db.update(redditMentions)
        .set({ draftReply: draft, replyStatus: 'pending' })
        .where(eq(redditMentions.id, mention.id)),
    );

    // 5. Add to approval queue
    await withTenantDb(tenantId, async (db) =>
      db.insert(approvalQueue).values({
        tenantId,
        agentType: 'reddit',
        actionType: 'post_reddit_reply',
        proposedChange: { mentionId: mention.id, postId, subreddit: mention.subreddit, draftReply: draft },
        currentValue: { postTitle: mention.postTitle },
        priority: 'medium',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }),
    );

    return { mentionId: mention.id, drafted: true };
  }
}
