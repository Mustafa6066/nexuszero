import type { Job } from 'bullmq';
import { withTenantDb, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { routedCompletion, ModelPreset } from '@nexuszero/llm-router';

/**
 * Quote Mining Handler
 *
 * Extracts compelling quotes and data points from raw sources
 * (transcripts, interviews, reports) for content enrichment.
 *
 * Ported from: ai-marketing-skills writing/SKILL.md
 */
export class QuoteMiningHandler {
  async execute(input: any, job: Job): Promise<any> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const { sources = [], topic, maxQuotes = 20 } = input;

    const prompt = `You are a content researcher extracting high-impact quotes and data points.

TOPIC: ${topic}

SOURCES:
${sources.map((s: any, i: number) => `--- Source ${i + 1}: ${s.title || 'Untitled'} ---\n${(s.content || '').slice(0, 3000)}`).join('\n\n')}

Extract and return JSON:
{
  "quotes": [
    {
      "text": string,
      "speaker": string,
      "context": string,
      "sourceIndex": number,
      "impactScore": number,
      "usageNote": string,
      "tags": string[]
    }
  ],
  "dataPoints": [
    {
      "stat": string,
      "source": string,
      "year": number | null,
      "context": string,
      "verifiable": boolean,
      "usageNote": string
    }
  ],
  "keyInsights": [
    {
      "insight": string,
      "supportingQuotes": number[],
      "contentAngle": string
    }
  ]
}

Rules:
- Impact score 0-10 based on quotability, specificity, emotional resonance
- Only include quotes with impact >= 6
- Flag data points as verifiable=false if they seem approximate
- Max ${maxQuotes} quotes, ranked by impact
- Tags should categorize: "personal_story", "data_backed", "contrarian", "expert_opinion", "trend"`;

    const raw = await routedCompletion({
      model: ModelPreset.LONG_FORM,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      temperature: 0.4,
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
          actionType: 'quote_mining',
          category: 'research',
          reasoning: `Mined ${result.quotes?.length || 0} quotes and ${result.dataPoints?.length || 0} data points from ${sources.length} sources.`,
          trigger: { taskType: 'quote_mining' },
          afterState: { quoteCount: result.quotes?.length || 0, dataPointCount: result.dataPoints?.length || 0 },
          confidence: 0.8,
          impactMetric: 'quotes_extracted',
          impactDelta: result.quotes?.length || 0,
        });
      });
    } catch (e) {
      console.warn('Failed to log quote mining:', (e as Error).message);
    }

    await job.updateProgress(100);
    return { mined: result, completedAt: new Date().toISOString() };
  }
}
