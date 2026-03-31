import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { SubredditScanHandler } from './handlers/subreddit-scan.js';
import { DraftReplyHandler } from './handlers/draft-reply.js';
import { PostReplyHandler } from './handlers/post-reply.js';

export class RedditWorker extends BaseAgentWorker {
  readonly agentType = 'reddit' as const;

  constructor() {
    super({
      baseQueueName: 'reddit-tasks',
      concurrency: 3,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'reddit',
    });
  }

  private subredditScan = new SubredditScanHandler();
  private draftReply = new DraftReplyHandler();
  private postReply = new PostReplyHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const { taskType, payload } = task;

    switch (taskType) {
      case 'scan_subreddits':
        return this.subredditScan.execute(payload, job);
      case 'draft_reply':
        return this.draftReply.execute(payload, job);
      case 'post_reply':
        return this.postReply.execute(payload, job);
      default:
        throw new Error(`Unknown Reddit task type: ${taskType}`);
    }
  }
}
