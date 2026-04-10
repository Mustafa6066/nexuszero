import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * Survey Lead Magnet Handler
 *
 * Generates interactive survey-based lead magnets with scoring logic,
 * personalized results pages, and follow-up email sequences.
 *
 * Ported from: ai-marketing-skills conversion-optimization/SKILL.md
 */
export class SurveyLeadMagnetHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      topic,
      industry = 'SaaS',
      targetAudience,
      questionCount = 7,
      resultSegments = 3,
    } = input;

    const prompt = `You are a conversion specialist. Create an interactive survey lead magnet.

TOPIC: ${topic}
INDUSTRY: ${industry}
TARGET AUDIENCE: ${targetAudience || 'marketing professionals'}
QUESTIONS: ${questionCount}
RESULT SEGMENTS: ${resultSegments}

Return JSON:
{
  "survey": {
    "title": string,
    "subtitle": string,
    "questions": [
      {
        "id": number,
        "text": string,
        "type": "multiple_choice" | "scale" | "yes_no",
        "options": [
          {
            "label": string,
            "value": number,
            "segment_weight": Record<string, number>
          }
        ]
      }
    ],
    "scoringLogic": {
      "segments": [
        {
          "id": string,
          "name": string,
          "scoreRange": [number, number],
          "headline": string,
          "description": string,
          "recommendations": string[],
          "ctaText": string,
          "ctaUrl": string
        }
      ]
    },
    "followUpEmails": [
      {
        "segment": string,
        "delay": string,
        "subject": string,
        "previewText": string,
        "bodyOutline": string
      }
    ]
  },
  "conversionTips": {
    "formPlacement": string,
    "progressIndicator": boolean,
    "socialProof": string,
    "estimatedCompletionTime": string
  }
}

Rules:
- Each question should have 3-5 options
- Options should subtly map to segments via weights
- Results should feel personalized, not generic
- Follow-up emails: 3 per segment (immediate, day 3, day 7)
- CTA should be segment-specific (not one-size-fits-all)
- Include social proof suggestion for the form`;

    const raw = await routedCompletion({
      model: ModelPreset.LONG_FORM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 8192,
      temperature: 0.7,
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
          actionType: 'survey_lead_magnet',
          category: 'creation',
          reasoning: `Generated survey lead magnet "${result.survey?.title || topic}" with ${result.survey?.questions?.length || 0} questions, ${result.survey?.scoringLogic?.segments?.length || 0} segments.`,
          trigger: { taskType: 'survey_lead_magnet' },
          afterState: {
            questionCount: result.survey?.questions?.length || 0,
            segmentCount: result.survey?.scoringLogic?.segments?.length || 0,
          },
          confidence: 0.8,
          impactMetric: 'lead_magnets_created',
          impactDelta: 1,
        });
      });
    } catch (e) {
      console.warn('Failed to log survey lead magnet:', (e as Error).message);
    }

    await publishAgentSignal({
      tenantId,
      agentId: job.data.agentId || 'ad',
      type: 'conversion.lead_magnet_generated',
      data: { type: 'survey', topic },
    });

    await job.updateProgress(100);
    return { leadMagnet: result, completedAt: new Date().toISOString() };
  }
}
