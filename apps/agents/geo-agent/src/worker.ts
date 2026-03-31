import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { GeoKeywordHandler } from './handlers/geo-keyword-research.js';
import { GeoRankCheckHandler } from './handlers/geo-rank-check.js';
import { GeoCitationHandler } from './handlers/geo-citation-audit.js';
import { GeoSchemaHandler } from './handlers/geo-schema-generate.js';

export class GeoWorker extends BaseAgentWorker {
  readonly agentType = 'geo' as const;

  constructor() {
    super({
      baseQueueName: 'geo-tasks',
      concurrency: 3,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'geo',
    });
  }

  private geoKeyword = new GeoKeywordHandler();
  private geoRank = new GeoRankCheckHandler();
  private geoCitation = new GeoCitationHandler();
  private geoSchema = new GeoSchemaHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    switch (task.taskType) {
      case 'geo_keyword_research': return this.geoKeyword.execute(task.payload, job);
      case 'geo_rank_check': return this.geoRank.execute(task.payload, job);
      case 'geo_citation_audit': return this.geoCitation.execute(task.payload, job);
      case 'geo_schema_generate': return this.geoSchema.execute(task.payload, job);
      default: throw new Error(`Unknown GEO task type: ${task.taskType}`);
    }
  }
}
