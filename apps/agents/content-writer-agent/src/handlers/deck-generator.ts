import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * Deck Generator Handler
 *
 * Generates structured slide deck outlines with speaker notes.
 * Outputs structured JSON that can be rendered via Python sidecar (python-pptx).
 *
 * Ported from: ai-marketing-skills content-strategy/SKILL.md
 */
export class DeckGeneratorHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      topic,
      audience = 'stakeholders',
      slideCount = 12,
      style = 'professional',
      includeDataSlides = true,
      sourceContent,
    } = input;

    const prompt = `You are a presentation strategist. Create a structured slide deck.

TOPIC: ${topic}
AUDIENCE: ${audience}
TARGET SLIDES: ${slideCount}
STYLE: ${style}
${sourceContent ? `\nSOURCE CONTENT:\n${(sourceContent as string).slice(0, 4000)}` : ''}

Return JSON:
{
  "title": string,
  "subtitle": string,
  "slides": [
    {
      "slideNumber": number,
      "layout": "title" | "content" | "two_column" | "image" | "data" | "quote" | "closing",
      "headline": string,
      "bullets": string[],
      "speakerNotes": string,
      "dataViz": {
        "type": "bar" | "line" | "pie" | "table" | null,
        "data": any,
        "caption": string
      } | null,
      "imagePrompt": string | null
    }
  ],
  "storyline": {
    "arc": string,
    "keyTakeaways": string[],
    "callToAction": string
  }
}

Rules:
- Follow situation → complication → resolution arc
- First slide: title. Last slide: CTA/closing
- Include 2-3 data slides${includeDataSlides ? '' : ' (skip if includeDataSlides=false)'}
- Speaker notes should be 2-3 sentences per slide
- Bullets max 5 per slide, max 8 words each
- Include one quote slide if relevant`;

    const raw = await routedCompletion({
      model: ModelPreset.LONG_FORM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 8192,
      temperature: 0.6,
    });

    await job.updateProgress(80);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'generate_deck',
          category: 'creation',
          reasoning: `Generated ${result.slides?.length || 0}-slide deck "${result.title || topic}" for ${audience}.`,
          trigger: { taskType: 'generate_deck' },
          afterState: { slideCount: result.slides?.length || 0, title: result.title },
          confidence: 0.8,
          impactMetric: 'slides_generated',
          impactDelta: result.slides?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log deck generation:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { deck: result, completedAt: new Date().toISOString() };
  }
}
