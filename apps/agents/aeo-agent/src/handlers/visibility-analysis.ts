import type { Job } from 'bullmq';
import { withTenantDb, entityProfiles, aeoCitations, aiVisibilityScores, agentActions } from '@nexuszero/db';
import { eq, and } from 'drizzle-orm';
import { llmScoreVisibility } from '../llm.js';
import { publishAgentSignal } from '@nexuszero/queue';

const AI_PLATFORMS = ['chatgpt', 'perplexity', 'google_ai_overview', 'gemini', 'bing_copilot', 'claude'] as const;

export class VisibilityAnalysisHandler {
  async execute(input: Record<string, unknown>, job: Job): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;
    const targetPlatforms = (input.platforms as string[]) || [...AI_PLATFORMS];

    // 1. Get entity profiles
    const entities = await withTenantDb(tenantId, async (db) => {
      return db.select().from(entityProfiles)
        .where(eq(entityProfiles.tenantId, tenantId));
    });

    if (entities.length === 0) {
      return { analyzed: 0, message: 'No entity profiles found' };
    }

    const results: Array<{
      entity: string;
      platform: string;
      overallScore: number;
      recommendations: string[];
    }> = [];

    for (const entity of entities) {
      for (const platform of targetPlatforms) {
        // 2. Get citations for this entity-platform pair
        const citations = await withTenantDb(tenantId, async (db) => {
          return db.select().from(aeoCitations)
            .where(and(
              eq(aeoCitations.tenantId, tenantId),
              eq(aeoCitations.platform, platform as any),
            ));
        });

        // 3. LLM scoring
        const scores = await llmScoreVisibility({
          entityName: entity.entityName,
          platform,
          citations: citations.map(c => ({
            query: c.query,
            position: c.position,
            isBrandMention: c.isBrandMention,
            sentiment: c.sentiment,
          })),
          entityProfile: {
            schemaMarkupStatus: entity.schemaMarkupStatus,
            attributes: entity.attributes as Record<string, unknown> | null,
          },
        });

        // 4. Store visibility score
        await withTenantDb(tenantId, async (db) => {
          await db.insert(aiVisibilityScores).values({
            tenantId,
            platform: platform as any,
            overallScore: scores.overallScore,
            citationFrequency: scores.citationFrequency,
            sentimentScore: scores.sentimentScore,
            contentRelevance: scores.contentRelevance,
            entityClarity: scores.entityClarity,
            recommendations: scores.recommendations,
          });
        });

        results.push({
          entity: entity.entityName,
          platform,
          overallScore: scores.overallScore,
          recommendations: scores.recommendations,
        });
      }
    }

    // 5. Signal visibility change if significant
    const avgScore = results.reduce((s, r) => s + r.overallScore, 0) / Math.max(results.length, 1);
    await publishAgentSignal({
      tenantId,
      type: 'aeo.visibility_changed',
      agentId: 'aeo',
      targetAgent: 'broadcast',
      data: {
        entitiesAnalyzed: entities.length,
        platformsAnalyzed: targetPlatforms.length,
        averageVisibilityScore: avgScore,
        lowScoringPlatforms: results
          .filter(r => r.overallScore < 50)
          .map(r => ({ entity: r.entity, platform: r.platform, score: r.overallScore })),
      },
      priority: avgScore < 30 ? 'high' : 'low',
      confidence: 0.7,
      correlationId: job.data.correlationId as string,
    });

    // Log agent action
    try {
      await withTenantDb(tenantId, async (db) => {
        await db.insert(agentActions).values({
          tenantId,
          agentId: job.data.agentId || null,
          taskId: job.id || null,
          actionType: 'analyze_visibility',
          category: 'analysis',
          reasoning: `Analyzed visibility across ${targetPlatforms.length} platforms for ${entities.length} entities. Average score: ${avgScore.toFixed(1)}. Low-scoring: ${results.filter(r => r.overallScore < 50).length} platform-entity pairs.`,
          trigger: { taskType: 'analyze_visibility', platforms: targetPlatforms },
          afterState: { avgScore, entitiesAnalyzed: entities.length, lowScoring: results.filter(r => r.overallScore < 50).length },
          confidence: 0.7,
          impactMetric: 'visibility_score',
          impactDelta: avgScore,
        });
      });
    } catch (e) {
      console.warn('Failed to log agent action:', (e as Error).message);
    }

    return {
      entitiesAnalyzed: entities.length,
      platformsAnalyzed: targetPlatforms.length,
      totalScores: results.length,
      averageVisibilityScore: avgScore,
      results,
    };
  }
}
