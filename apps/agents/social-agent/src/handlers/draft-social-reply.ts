import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, socialMentions, approvalQueue, tenants } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { llmDraftTweet } from '../llm.js';

export class DraftSocialReplyHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;
    const externalId = input.externalId as string;

    if (!externalId) return { error: 'externalId is required' };

    const [mention] = await withTenantDb(tenantId, async (db) =>
      db.select().from(socialMentions)
        .where(and(eq(socialMentions.tenantId, tenantId), eq(socialMentions.externalId, externalId)))
        .limit(1),
    );

    if (!mention) return { error: `Mention not found: ${externalId}` };

    const [tenant] = await withTenantDb(tenantId, async (db) =>
      db.select({ settings: tenants.settings }).from(tenants)
        .where(eq(tenants.id, tenantId)).limit(1),
    );
    const brandVoice = (tenant?.settings as Record<string, unknown>)?.brandVoice as string ?? 'helpful and professional';

    let draft = '';
    if (mention.platform === 'twitter') {
      draft = await llmDraftTweet(
        { content: mention.content, authorHandle: mention.authorHandle ?? '' },
        brandVoice,
      );
    }

    if (!draft) return { error: 'Draft generation not supported for platform' };

    await withTenantDb(tenantId, async (db) =>
      db.update(socialMentions)
        .set({ draftReply: draft, replyStatus: 'draft' })
        .where(eq(socialMentions.id, mention.id)),
    );

    await withTenantDb(tenantId, async (db) =>
      db.insert(approvalQueue).values({
        tenantId,
        agentType: 'social',
        actionType: `post_${mention.platform}_reply`,
        proposedChange: { mentionId: mention.id, externalId, platform: mention.platform, draftReply: draft },
        currentValue: { content: mention.content },
        priority: 'medium',
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      }),
    );

    return { mentionId: mention.id, drafted: true, platform: mention.platform };
  }
}
