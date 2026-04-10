import type { Job } from 'bullmq';
import { withTenantDb, agentActions, outboundCampaigns } from '@nexuszero/db';
import { getCurrentTenantId, scanPii, redactPii } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { llmOutbound } from '../llm.js';

/**
 * Sequence Builder Handler
 *
 * Generates personalized multi-step outbound email sequences
 * with PII sanitization and A/B variant generation.
 *
 * Ported from: ai-marketing-skills outbound/SKILL.md
 */
export class SequenceBuilderHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const {
      prospects = [],
      product,
      valueProps = [],
      sequenceLength = 5,
      tone = 'professional',
      campaignName,
    } = input;

    const prompt = `You are an outbound sales copywriter. Generate a multi-touch email sequence.

PRODUCT: ${product || 'SaaS platform'}
VALUE PROPOSITIONS: ${valueProps.join('; ') || 'request demo'}
TONE: ${tone}
SEQUENCE LENGTH: ${sequenceLength} emails

PROSPECT PERSONAS (generate templates with {{firstName}}, {{company}}, {{painPoint}} merge tags):
${JSON.stringify(prospects.slice(0, 5), null, 2)}

Return JSON:
{
  "sequence": [
    {
      "step": number,
      "dayOffset": number,
      "channel": "email",
      "subject": string,
      "subjectVariantB": string,
      "body": string,
      "purpose": string,
      "cta": string,
      "notes": string
    }
  ],
  "personalizationGuide": {
    "requiredFields": string[],
    "optionalFields": string[],
    "researchChecklist": string[]
  },
  "performanceBenchmarks": {
    "expectedOpenRate": string,
    "expectedReplyRate": string,
    "optimalSendTimes": string[]
  }
}

Rules:
- Email 1: curiosity-driven, no pitch. Reference specific pain point.
- Email 2-3: value-led, social proof, case study reference
- Email 4: breakup/last chance angle
- Email 5: value-add (share article/insight, no ask)
- Subject lines: max 50 chars, no spam words
- Body: max 150 words per email
- Use merge tags, never hardcode PII`;

    const raw = await llmOutbound(prompt);
    await job.updateProgress(70);

    let result: any;
    try {
      result = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      result = { raw };
    }

    // PII check on generated content
    for (const step of (result.sequence || [])) {
      const piiCheck = scanPii(step.body || '');
      if (piiCheck.hasPii) {
        const redacted = redactPii(step.body || '');
        step.body = redacted.redactedContent;
        step.piiWarning = 'PII detected and redacted in generated content';
      }
    }

    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(outboundCampaigns).values({
          tenantId,
          name: campaignName || `Sequence-${new Date().toISOString().slice(0, 10)}`,
          channel: 'email',
          sequenceSteps: result.sequence || [],
          status: 'draft',
          metadata: { personalizationGuide: result.personalizationGuide, benchmarks: result.performanceBenchmarks },
        });

        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'sequence_build',
          category: 'creation',
          reasoning: `Built ${result.sequence?.length || 0}-step outbound sequence "${campaignName || 'untitled'}".`,
          trigger: { taskType: 'sequence_build' },
          afterState: { steps: result.sequence?.length || 0 },
          confidence: 0.85,
          impactMetric: 'sequences_created',
          impactDelta: 1,
        });
      });
    } catch (e) {
      console.warn('Failed to store sequence:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { sequence: result, completedAt: new Date().toISOString() };
  }
}
