import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import { SequenceBuilderHandler } from './handlers/sequence-builder.js';
import { CampaignScorerHandler } from './handlers/campaign-scorer.js';
import { LeadVerifierHandler } from './handlers/lead-verifier.js';
import { CompetitorMonitorHandler } from './handlers/competitor-monitor.js';
import { EmailWarmupHandler } from './handlers/email-warmup.js';

const sequenceBuilder = new SequenceBuilderHandler();
const campaignScorer = new CampaignScorerHandler();
const leadVerifier = new LeadVerifierHandler();
const competitorMonitor = new CompetitorMonitorHandler();
const emailWarmup = new EmailWarmupHandler();

export class OutboundWorker extends BaseAgentWorker {
  constructor() {
    super({
      baseQueueName: 'outbound-tasks',
      concurrency: 4,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'outbound-agent',
    });
  }

  async processTask(task: any, job: Job): Promise<any> {
    switch (task.taskType) {
      case 'sequence_build':
        return sequenceBuilder.execute(task.input, job);
      case 'campaign_score':
        return campaignScorer.execute(task.input, job);
      case 'lead_verification':
        return leadVerifier.execute(task.input, job);
      case 'competitor_monitor':
        return competitorMonitor.execute(task.input, job);
      case 'email_warmup':
        return emailWarmup.execute(task.input, job);
      default:
        throw new Error(`Unknown outbound task type: ${task.taskType}`);
    }
  }
}
