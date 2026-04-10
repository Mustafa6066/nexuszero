import type { Job } from 'bullmq';
import { withTenantDb, agentActions, contentCalendar } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * Editorial Brain Handler
 *
 * AI-powered editorial calendar generation. Maps topic clusters to
 * publication slots, balances TOFU/MOFU/BOFU, prevents topic cannibalization.
 *
 * Ported from: ai-marketing-skills content-strategy/SKILL.md
 */
export class EditorialBrainHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      topics = [],
      existingContent = [],
      weeksAhead = 4,
      postsPerWeek = 3,
      funnelMix = { tofu: 0.4, mofu: 0.35, bofu: 0.25 },
    } = input;

    const prompt = `You are an editorial strategist. Create a content calendar.

TOPICS & CLUSTERS:
${JSON.stringify(topics)}

EXISTING PUBLISHED CONTENT (avoid cannibalization):
${JSON.stringify(existingContent.slice(0, 50))}

PARAMETERS:
- Weeks ahead: ${weeksAhead}
- Posts per week: ${postsPerWeek}
- Funnel mix: TOFU ${funnelMix.tofu * 100}%, MOFU ${funnelMix.mofu * 100}%, BOFU ${funnelMix.bofu * 100}%

Return JSON:
{
  "calendar": [
    {
      "week": number,
      "entries": [
        {
          "title": string,
          "topic": string,
          "funnelStage": "TOFU" | "MOFU" | "BOFU",
          "format": string,
          "targetKeywords": string[],
          "internalLinks": string[],
          "publishDate": string,
          "estimatedWords": number,
          "priority": "high" | "medium" | "low",
          "notes": string
        }
      ]
    }
  ],
  "topicClusters": [
    {
      "pillar": string,
      "supporting": string[],
      "coverage": number
    }
  ],
  "cannibalizationWarnings": [
    {
      "newTitle": string,
      "conflictsWith": string,
      "resolution": string
    }
  ]
}

Rules:
- Each week should follow funnel mix ratios
- Link supporting content to pillar pages
- Flag topic overlap with existing content
- Vary formats (blog, guide, listicle, comparison, case study)`;

    const raw = await routedCompletion({
      model: ModelPreset.LONG_FORM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 8192,
      temperature: 0.7,
    });

    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    // Store calendar entries
    try {
      await withTenantDb(tenantId, async (db) => {
        const entries = result.calendar?.flatMap((week: any) =>
          week.entries?.map((entry: any) => ({
            tenantId,
            title: entry.title,
            topic: entry.topic,
            funnelStage: entry.funnelStage?.toLowerCase() || 'tofu',
            format: entry.format,
            scheduledDate: entry.publishDate ? new Date(entry.publishDate) : null,
            status: 'planned' as const,
            metadata: { targetKeywords: entry.targetKeywords, notes: entry.notes },
          })) || [],
        ) || [];

        if (entries.length > 0) {
          await db.insert(contentCalendar).values(entries);
        }

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'editorial_brain',
          category: 'planning',
          reasoning: `Generated ${weeksAhead}-week editorial calendar with ${entries.length} entries. ${result.cannibalizationWarnings?.length || 0} cannibalization warnings.`,
          trigger: { taskType: 'editorial_brain' },
          afterState: { entryCount: entries.length, weeks: weeksAhead },
          confidence: 0.8,
          impactMetric: 'calendar_entries_planned',
          impactDelta: entries.length,
        });
      });
    } catch (e) {
      console.warn('Failed to store editorial calendar:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { editorial: result, completedAt: new Date().toISOString() };
  }
}
