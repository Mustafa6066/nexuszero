import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { CitationScanHandler } from './handlers/citation-scan.js';
import { SchemaOptimizerHandler } from './handlers/schema-optimizer.js';
import { VisibilityAnalysisHandler } from './handlers/visibility-analysis.js';
import { buildEntityGraph } from './graph/graph-builder.js';

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
      case 'aeo_probe':
        return this.citationScan.execute(payload, job);
      case 'optimize_schema':
        return this.schemaOptimizer.execute(payload, job);
      case 'analyze_visibility':
        return this.visibilityAnalysis.execute(payload, job);
      case 'update_seo_strategy':
        // Cross-agent signal response: update entity profiles based on SEO findings
        return this.schemaOptimizer.updateFromSeo(payload, job);
      case 'build_entity_graph':
        return this.handleBuildEntityGraph(payload, job);
      default:
        throw new Error(`Unknown AEO task type: ${taskType}`);
    }
  }

  private async handleBuildEntityGraph(payload: Record<string, unknown>, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const tenantId = job.data.tenantId as string;
    const entityId = payload.entityId as string;
    if (!entityId) {
      return { error: 'entityId is required for build_entity_graph' };
    }
    const result = await buildEntityGraph(tenantId, entityId);
    return { entityId, ...result };
  }
}
