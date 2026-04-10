import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { GenerateCreativeHandler } from './handlers/generate-creative.js';
import { TestVariantHandler } from './handlers/test-variant.js';
import { FatigueDetectionHandler } from './handlers/fatigue-detection.js';
import { BrandConsistencyHandler } from './handlers/brand-consistency.js';

export class CreativeWorker extends BaseAgentWorker {
  readonly agentType = 'creative' as const;

  constructor() {
    super({
      baseQueueName: 'creative-tasks',
      concurrency: 5,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'creative',
    });
  }

  private generateHandler = new GenerateCreativeHandler();
  private testVariantHandler = new TestVariantHandler();
  private fatigueHandler = new FatigueDetectionHandler();
  private brandHandler = new BrandConsistencyHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const { taskType, payload } = task;

    switch (taskType) {
      case 'image_generation':
      case 'copy_generation':
      case 'video_script_writing':
      case 'landing_page_build':
      case 'format_adaptation':
        return this.generateHandler.execute(taskType, payload, job);
      case 'ab_test_setup':
      case 'ab_test_analysis':
      case 'winner_scaling':
        return this.testVariantHandler.execute(taskType, payload, job);
      case 'fatigue_detection':
      case 'creative_scoring':
        return this.fatigueHandler.execute(taskType, payload, job);
      case 'brand_consistency_check':
        return this.brandHandler.execute(payload, job);
      default:
        throw new Error(`Unknown creative task type: ${taskType}`);
    }
  }
}
