import type { Job } from 'bullmq';
import { withTenantDb, campaigns, agentActions } from '@nexuszero/db';
import { getCurrentTenantId } from '@nexuszero/shared';
import { publishAgentSignal } from '@nexuszero/queue';
import { creativeLlm, parseLlmJson } from '../llm.js';

const PROMPTS: Record<string, string> = {
  image_generation: `Generate an image creative brief for a marketing campaign. Return JSON:
{
  "headline": string,
  "visualConcept": string,
  "colorPalette": string[],
  "targetAudience": string,
  "emotionalTone": string,
  "aspectRatios": string[],
  "variants": [{ "id": string, "description": string, "hook": string }]
}`,
  copy_generation: `Generate ad copy variants for a marketing campaign. Return JSON:
{
  "headlines": [{ "text": string, "angle": string, "emotionalAppeal": string }],
  "descriptions": [{ "text": string, "cta": string }],
  "longFormCopy": string,
  "toneAnalysis": string,
  "keyBenefits": string[]
}`,
  video_script_writing: `Write a video script for a marketing campaign. Return JSON:
{
  "title": string,
  "duration": string,
  "scenes": [{ "timestamp": string, "visual": string, "voiceover": string, "onScreenText": string }],
  "cta": string,
  "musicMood": string,
  "targetEmotion": string
}`,
  landing_page_build: `Design a landing page structure for a marketing campaign. Return JSON:
{
  "headline": string,
  "subheadline": string,
  "heroSection": { "type": string, "content": string },
  "sections": [{ "type": string, "heading": string, "content": string }],
  "cta": { "text": string, "style": string },
  "socialProof": string[],
  "seoMeta": { "title": string, "description": string }
}`,
  format_adaptation: `Adapt a creative asset for different platforms and formats. Return JSON:
{
  "adaptations": [{ "platform": string, "format": string, "dimensions": string, "adjustments": string[] }],
  "platformSpecificCopy": Record<string, string>,
  "recommendations": string[]
}`,
};

export class GenerateCreativeHandler {
  async execute(taskType: string, payload: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = getCurrentTenantId();
    await job.updateProgress(10);

    const campaignData = await withTenantDb(tenantId, async (db) => {
      if (payload.campaignId) {
        const [campaign] = await db.select().from(campaigns)
          .where(campaigns.id.equals(payload.campaignId as string));
        return campaign;
      }
      return null;
    });

    await job.updateProgress(30);

    const basePrompt = PROMPTS[taskType] ?? PROMPTS.copy_generation;
    const contextPrompt = `${basePrompt}

Campaign context: ${JSON.stringify(payload)}
${campaignData ? `Campaign details: ${JSON.stringify({ name: campaignData.name, type: campaignData.type, config: campaignData.config })}` : ''}`;

    const systemPrompt = 'You are an expert creative director specializing in digital marketing. Generate high-converting creative assets. Always respond with valid JSON.';
    const raw = await creativeLlm(contextPrompt, systemPrompt);
    await job.updateProgress(80);

    let result: Record<string, unknown>;
    try {
      result = parseLlmJson(raw);
    } catch {
      result = { raw, parseError: true };
    }

    // Signal ad agent about new creative assets
    await publishAgentSignal({
      tenantId,
      agentId: 'creative-worker',
      type: 'creative_generated',
      data: { taskType, creativeType: taskType, ...result },
    });

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentType: 'creative',
          category: 'creative_generation',
          action: `Generated ${taskType.replace(/_/g, ' ')}`,
          reasoning: `Produced creative assets using LLM-powered generation for ${taskType}`,
          impact: result.headlines ? `${(result.headlines as any[]).length} variants` : 'Creative brief generated',
          metadata: { taskType, inputKeys: Object.keys(payload) },
        });
      });
    } catch { /* non-critical */ }

    await job.updateProgress(100);
    return { taskType, ...result };
  }
}
