import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { CitationScanHandler } from './handlers/citation-scan.js';
import { SchemaOptimizerHandler } from './handlers/schema-optimizer.js';
import { VisibilityAnalysisHandler } from './handlers/visibility-analysis.js';

export class AeoWorker extends BaseAgentWorker {
  readonly agentType = 'aeo' as const;

  constructor() {
    super({
      baseQueueName: 'aeo-tasks',
      concurrency: 5,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'aeo',
    });
  }

  private citationScan = new CitationScanHandler();
  private schemaOptimizer = new SchemaOptimizerHandler();
  private visibilityAnalysis = new VisibilityAnalysisHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const { taskType, payload } = task;

    switch (taskType) {
      case 'scan_citations':
        return this.citationScan.execute(payload, job);
      case 'optimize_schema':
        return this.schemaOptimizer.execute(payload, job);
      case 'analyze_visibility':
        return this.visibilityAnalysis.execute(payload, job);
      case 'update_seo_strategy':
        // Cross-agent signal response: update entity profiles based on SEO findings
        return this.schemaOptimizer.updateFromSeo(payload, job);
      default:
        throw new Error(`Unknown AEO task type: ${taskType}`);
    }
  }
}
