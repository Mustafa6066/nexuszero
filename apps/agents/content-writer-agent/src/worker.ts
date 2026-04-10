import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { BlogPostHandler } from './handlers/blog-post.js';
import { SocialCopyHandler } from './handlers/social-copy.js';
import { EmailCopyHandler } from './handlers/email-copy.js';
import { PublishContentHandler } from './handlers/publish-content.js';
import { ExpertPanelReviewHandler } from './handlers/expert-panel-review.js';
import { QualityGateHandler } from './handlers/quality-gate.js';
import { EditorialBrainHandler } from './handlers/editorial-brain.js';
import { QuoteMiningHandler } from './handlers/quote-mining.js';
import { ContentTransformHandler } from './handlers/content-transform.js';
import { XLongformHandler } from './handlers/x-longform.js';
import { DeckGeneratorHandler } from './handlers/deck-generator.js';

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
  private expertPanel = new ExpertPanelReviewHandler();
  private qualityGate = new QualityGateHandler();
  private editorialBrain = new EditorialBrainHandler();
  private quoteMining = new QuoteMiningHandler();
  private contentTransform = new ContentTransformHandler();
  private xLongform = new XLongformHandler();
  private deckGenerator = new DeckGeneratorHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    switch (task.taskType) {
      case 'write_blog_post': return this.blogPost.execute(task.payload, job);
      case 'write_social_copy': return this.socialCopy.execute(task.payload, job);
      case 'write_email': return this.emailCopy.execute(task.payload, job);
      case 'publish_content': return this.publishContent.execute(task.payload, job);
      case 'expert_panel_review': return this.expertPanel.execute(task.payload, job);
      case 'quality_gate': return this.qualityGate.execute(task.payload, job);
      case 'editorial_brain': return this.editorialBrain.execute(task.payload, job);
      case 'quote_mining': return this.quoteMining.execute(task.payload, job);
      case 'content_transform': return this.contentTransform.execute(task.payload, job);
      case 'x_longform_post': return this.xLongform.execute(task.payload, job);
      case 'generate_deck': return this.deckGenerator.execute(task.payload, job);
      default: throw new Error(`Unknown Content Writer task type: ${task.taskType}`);
    }
  }
}
