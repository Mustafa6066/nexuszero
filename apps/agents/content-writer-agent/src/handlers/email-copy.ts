import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, contentDrafts, approvalQueue } from '@nexuszero/db';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmWriteEmail } from '../llm.js';
import type { ContentBrief } from '../llm.js';

export class EmailCopyHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;
    const brief = (input.brief ?? input) as ContentBrief;

    const { subjectLines, previewText, htmlBody } = await llmWriteEmail(brief);

    const [draft] = (await withTenantDb(tenantId, async (db) =>
      db.insert(contentDrafts).values({
        tenantId,
        type: 'email',
        title: subjectLines[0] ?? brief.topic,
        content: htmlBody,
        brief: brief as unknown as Record<string, unknown>,
        status: 'draft',
        llmModel: 'anthropic/claude-sonnet-4-5',
        metadata: { subjectLines, previewText },
      }).returning({ id: contentDrafts.id }),
    )) as [{ id: string }];

    await withTenantDb(tenantId, async (db) =>
      db.insert(approvalQueue).values({
        tenantId,
        agentType: 'content-writer',
        actionType: 'send_email_campaign',
        proposedChange: { draftId: draft.id, subjectLines, previewText },
        currentValue: null,
        priority: 'medium',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );

    await publishAgentSignal({
      tenantId, type: 'content.draft_ready', agentId: 'content-writer',
      data: { draftId: draft.id, type: 'email', subjectLines }, priority: 'low', confidence: 0.9,
    });

    return { draftId: draft.id, subjectLines, previewText };
  }
}
