import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { BlogPostHandler } from './handlers/blog-post.js';
import { SocialCopyHandler } from './handlers/social-copy.js';
import { EmailCopyHandler } from './handlers/email-copy.js';
import { PublishContentHandler } from './handlers/publish-content.js';

export class ContentWriterWorker extends BaseAgentWorker {
  readonly agentType = 'content-writer' as const;

  constructor() {
    super({
      baseQueueName: 'content-tasks',
      concurrency: 3,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'content-writer',
    });
  }

  private blogPost = new BlogPostHandler();
  private socialCopy = new SocialCopyHandler();
  private emailCopy = new EmailCopyHandler();
  private publishContent = new PublishContentHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    switch (task.taskType) {
      case 'write_blog_post': return this.blogPost.execute(task.payload, job);
      case 'write_social_copy': return this.socialCopy.execute(task.payload, job);
      case 'write_email': return this.emailCopy.execute(task.payload, job);
      case 'publish_content': return this.publishContent.execute(task.payload, job);
      default: throw new Error(`Unknown Content Writer task type: ${task.taskType}`);
    }
  }
}
