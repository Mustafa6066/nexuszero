import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import { PodcastIngestHandler } from './handlers/podcast-ingest.js';
import { ContentExtractHandler } from './handlers/content-extract.js';
import { ContentGenerateHandler } from './handlers/content-generate.js';
import { ViralScoreHandler } from './handlers/viral-score.js';
import { CalendarBuildHandler } from './handlers/calendar-build.js';

const podcastIngest = new PodcastIngestHandler();
const contentExtract = new ContentExtractHandler();
const contentGenerate = new ContentGenerateHandler();
const viralScore = new ViralScoreHandler();
const calendarBuild = new CalendarBuildHandler();

export class PodcastWorker extends BaseAgentWorker {
  constructor() {
    super({
      baseQueueName: 'podcast-tasks',
      concurrency: 4,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'podcast-agent',
    });
  }

  async processTask(task: any, job: Job): Promise<any> {
    switch (task.taskType) {
      case 'podcast_ingest':
        return podcastIngest.execute(task.input, job);
      case 'content_extract':
        return contentExtract.execute(task.input, job);
      case 'content_generate':
        return contentGenerate.execute(task.input, job);
      case 'viral_score':
        return viralScore.execute(task.input, job);
      case 'calendar_build':
        return calendarBuild.execute(task.input, job);
      default:
        throw new Error(`Unknown podcast task type: ${task.taskType}`);
    }
  }
}
