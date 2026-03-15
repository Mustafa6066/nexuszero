import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { SeoAuditHandler } from './handlers/seo-audit.js';
import { KeywordResearchHandler } from './handlers/keyword-research.js';
import { ContentOptimizationHandler } from './handlers/content-optimization.js';
import { TechnicalSeoHandler } from './handlers/technical-seo.js';
import { CompetitorAnalysisHandler } from './handlers/competitor-analysis.js';

export class SeoWorker extends BaseAgentWorker {
  readonly agentType = 'seo' as const;

  constructor() {
    super({
      baseQueueName: 'seo-tasks',
      concurrency: 5,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'seo',
    });
  }

  private auditHandler = new SeoAuditHandler();
  private keywordHandler = new KeywordResearchHandler();
  private contentHandler = new ContentOptimizationHandler();
  private technicalHandler = new TechnicalSeoHandler();
  private competitorHandler = new CompetitorAnalysisHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const { taskType, payload } = task;

    switch (taskType) {
      case 'seo_audit':
        return this.auditHandler.execute(payload, job);
      case 'keyword_research':
        return this.keywordHandler.execute(payload, job);
      case 'content_optimization':
        return this.contentHandler.execute(payload, job);
      case 'technical_seo_check':
        return this.technicalHandler.execute(payload, job);
      case 'technical_seo_deep':
        return this.technicalHandler.execute({ ...payload, deep: true }, job);
      case 'competitor_analysis':
        return this.competitorHandler.execute(payload, job);
      case 'update_seo_strategy':
        return this.auditHandler.updateStrategy(payload, job);
      default:
        throw new Error(`Unknown SEO task type: ${taskType}`);
    }
  }
}
