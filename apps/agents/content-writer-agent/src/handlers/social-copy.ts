import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, contentDrafts, approvalQueue } from '@nexuszero/db';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmWriteSocialCopy } from '../llm.js';
import type { ContentBrief } from '../llm.js';

const PLATFORMS = ['twitter', 'linkedin', 'instagram', 'facebook'] as const;

export class SocialCopyHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;
    const brief = (input.brief ?? input) as ContentBrief;

    const copies = await llmWriteSocialCopy(brief);

    const draftIds: string[] = [];

    for (const platform of PLATFORMS) {
      const copy = copies[platform];
      if (!copy) continue;

      const [draft] = (await withTenantDb(tenantId, async (db) =>
        db.insert(contentDrafts).values({
          tenantId,
          type: 'social_post',
          title: `${platform}: ${brief.topic}`,
          content: copy,
          brief: { ...(brief as unknown as Record<string, unknown>), platform },
          status: 'draft',
          llmModel: 'anthropic/claude-sonnet-4-5',
          metadata: { platform },
        }).returning({ id: contentDrafts.id }),
      )) as [{ id: string }];
      draftIds.push(draft.id);
    }

    await withTenantDb(tenantId, async (db) =>
      db.insert(approvalQueue).values({
        tenantId,
        agentType: 'content-writer',
        actionType: 'publish_social_copy',
        proposedChange: { draftIds, topic: brief.topic, platforms: Object.keys(copies) },
        currentValue: null,
        priority: 'low',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );

    await publishAgentSignal({
      tenantId,
      type: 'content.draft_ready',
      agentId: 'content-writer',
      data: { draftIds, type: 'social_post', platforms: Object.keys(copies) },
      priority: 'low',
      confidence: 0.9,
    });

    return { draftIds, platforms: Object.keys(copies) };
  }
}
