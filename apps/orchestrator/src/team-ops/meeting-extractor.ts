import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { createLogger } from '@nexuszero/shared';

const logger = createLogger('team-ops:meeting-extractor');

/**
 * Meeting Extractor
 *
 * Extracts structured data from meeting transcripts:
 * - Decisions made
 * - Action items (with owners and deadlines)
 * - Open questions
 * - Key insights
 * - Follow-ups and implicit commitments
 *
 * NOT a separate agent — internal orchestrator capability exposed via API.
 *
 * Ported from: ai-marketing-skills/team-ops
 */

interface MeetingExtractionInput {
  tenantId: string;
  transcript: string;
  meetingTitle?: string;
  attendees?: string[];
  meetingType?: string;
  duration?: number;
}

export async function extractMeetingInsights(input: MeetingExtractionInput) {
  const { tenantId, transcript, meetingTitle = 'Untitled Meeting', attendees = [], meetingType = 'general', duration = 0 } = input;

  if (!transcript || transcript.length < 50) {
    return { error: 'Transcript too short or missing' };
  }

  const truncated = transcript.length > 25000 ? transcript.slice(0, 25000) + '\n[TRUNCATED]' : transcript;

  const prompt = `Extract structured data from this meeting transcript.

MEETING: ${meetingTitle}
TYPE: ${meetingType}
ATTENDEES: ${JSON.stringify(attendees)}
DURATION: ${duration ? `${Math.round(duration / 60)} minutes` : 'Unknown'}

TRANSCRIPT:
${truncated}

Return JSON:
{
  "summary": string,
  "decisions": [
    {
      "decision": string,
      "madeBy": string | null,
      "context": string,
      "confidence": number
    }
  ],
  "actionItems": [
    {
      "action": string,
      "owner": string | null,
      "deadline": string | null,
      "priority": "high" | "medium" | "low",
      "confidence": number
    }
  ],
  "openQuestions": [
    {
      "question": string,
      "raisedBy": string | null,
      "needsFollowUp": boolean
    }
  ],
  "keyInsights": [
    {
      "insight": string,
      "speaker": string | null,
      "relevance": "strategic" | "tactical" | "informational"
    }
  ],
  "implicitCommitments": [
    {
      "commitment": string,
      "by": string | null,
      "confidence": number,
      "suggestMakingExplicit": boolean
    }
  ],
  "followUps": [
    {
      "topic": string,
      "suggestedNextStep": string,
      "suggestedOwner": string | null
    }
  ],
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "meetingEffectiveness": number
}`;

  const raw = await routedCompletion({
    model: ModelPreset.LONG_FORM,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 6144,
    temperature: 0.2,
    systemPrompt: 'You are a meticulous meeting analyst. Extract every decision, action item, and commitment. Flag implicit things people agreed to without formally stating.',
  });

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
        agentId: null,
        taskId: null,
        actionType: 'meeting_extraction',
        category: 'operations',
        reasoning: `Extracted from "${meetingTitle}": ${result.decisions?.length || 0} decisions, ${result.actionItems?.length || 0} action items, ${result.openQuestions?.length || 0} open questions.`,
        trigger: { source: 'team-ops', meetingTitle },
        afterState: { decisions: result.decisions?.length || 0, actionItems: result.actionItems?.length || 0 },
        confidence: 0.8,
        impactMetric: 'meetings_processed',
        impactDelta: 1,
      });
    });
  } catch (e) {
    logger.warn('Failed to log meeting extraction', { error: (e as Error).message });
  }

  return result;
}
