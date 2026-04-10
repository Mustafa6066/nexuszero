import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { TwitterScanHandler } from './handlers/twitter-scan.js';
import { HackerNewsScanHandler } from './handlers/hackernews-scan.js';
import { YouTubeScanHandler } from './handlers/youtube-scan.js';
import { DraftSocialReplyHandler } from './handlers/draft-social-reply.js';
import { YtCompetitiveHandler } from './handlers/yt-competitive.js';

export class SocialWorker extends BaseAgentWorker {
  readonly agentType = 'social' as const;

  constructor() {
    super({
      baseQueueName: 'social-tasks',
      concurrency: 3,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'social',
    });
  }

  private twitterScan = new TwitterScanHandler();
  private hnScan = new HackerNewsScanHandler();
  private youtubeScan = new YouTubeScanHandler();
  private draftReply = new DraftSocialReplyHandler();
  private ytCompetitive = new YtCompetitiveHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    switch (task.taskType) {
      case 'scan_twitter': return this.twitterScan.execute(task.payload, job);
      case 'scan_hackernews': return this.hnScan.execute(task.payload, job);
      case 'scan_youtube': return this.youtubeScan.execute(task.payload, job);
      case 'draft_social_reply': return this.draftReply.execute(task.payload, job);
      case 'yt_competitive_analysis': return this.ytCompetitive.execute(task.payload, job);
      default: throw new Error(`Unknown Social task type: ${task.taskType}`);
    }
  }
}
