import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { withTenantDb, contentDrafts, approvalQueue } from '@nexuszero/db';
import { publishAgentSignal } from '@nexuszero/queue';
import { webSearch } from '@nexuszero/prober';
import { llmWriteBlogPost, llmScoreContent } from '../llm.js';
import type { ContentBrief } from '../llm.js';

export class BlogPostHandler {
  async execute(input: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId;
    const brief = (input.brief ?? input) as ContentBrief;
    const useWebSearch = Boolean(input.useWebSearch ?? false);
    const start = Date.now();

    // 1. Optional web research
    const researchContext = useWebSearch && brief.topic
      ? await webSearch(brief.topic, 5)
      : [];

    // 2. Generate blog post
    const { title, content } = await llmWriteBlogPost(brief, researchContext);

    // 3. Score content
    const { seoScore, readabilityScore } = await llmScoreContent(content, brief.keywords ?? []);

    const generationTimeMs = Date.now() - start;

    // 4. Store draft
    const [draft] = await withTenantDb(tenantId, async (db) =>
      db.insert(contentDrafts).values({
        tenantId,
        type: 'blog_post',
        title,
        content,
        brief: brief as Record<string, unknown>,
        status: 'draft',
        seoScore,
        readabilityScore,
        llmModel: 'openai/gpt-4o',
        generationTimeMs,
        taskId: job.id ? job.id : undefined,
        metadata: { researchSources: researchContext.length, useWebSearch },
      }).returning({ id: contentDrafts.id }),
    );

    // 5. Add to approval queue
    await withTenantDb(tenantId, async (db) =>
      db.insert(approvalQueue).values({
        tenantId,
        agentType: 'content-writer',
        actionType: 'publish_blog_post',
        proposedChange: { draftId: draft.id, title, seoScore, readabilityScore },
        currentValue: null,
        priority: 'low',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    );

    // 6. Signal
    await publishAgentSignal({
      tenantId,
      type: 'content.draft_ready',
      agentId: 'content-writer',
      data: { draftId: draft.id, type: 'blog_post', title, seoScore },
      priority: 'low',
      confidence: 0.9,
    });

    return { draftId: draft.id, title, seoScore, readabilityScore, generationTimeMs };
  }
}
