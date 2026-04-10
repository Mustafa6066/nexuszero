import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { BidOptimizer } from './handlers/bid-optimizer.js';
import { CampaignManager } from './handlers/campaign-manager.js';
import { AudienceTargeting } from './handlers/audience-targeting.js';
import { CreativeEngine } from './handlers/creative-engine.js';
import { CroAuditHandler } from './handlers/cro-audit.js';
import { SurveyLeadMagnetHandler } from './handlers/survey-lead-magnet.js';

export class AdWorker extends BaseAgentWorker {
  readonly agentType = 'ad' as const;

  constructor() {
    super({
      baseQueueName: 'ad-tasks',
      concurrency: 5,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'ad',
    });
  }

  private bidOptimizer = new BidOptimizer();
  private campaignManager = new CampaignManager();
  private audienceTargeting = new AudienceTargeting();
  private creativeEngine = new CreativeEngine();
  private croAudit = new CroAuditHandler();
  private surveyLeadMagnet = new SurveyLeadMagnetHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const { taskType, payload } = task;

    switch (taskType) {
      case 'optimize_bids':
        return this.bidOptimizer.execute(payload, job);
      case 'manage_campaign':
        return this.campaignManager.execute(payload, job);
      case 'sync_keywords':
        return this.campaignManager.syncKeywords(payload, job);
      case 'analyze_audience':
        return this.audienceTargeting.execute(payload, job);
      case 'generate_creative':
        return this.creativeEngine.generate(payload, job);
      case 'run_ab_test':
        return this.creativeEngine.runAbTest(payload, job);
      case 'check_fatigue':
        return this.creativeEngine.checkFatigue(payload, job);
      case 'cro_audit':
        return this.croAudit.execute(payload, job);
      case 'survey_lead_magnet':
        return this.surveyLeadMagnet.execute(payload, job);
      default:
        throw new Error(`Unknown ad task type: ${taskType}`);
    }
  }
}
