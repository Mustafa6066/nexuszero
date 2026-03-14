import { Worker, type Job } from 'bullmq';
import { extractTraceContext, QUEUE_NAMES, spanKindForMessagingConsumer, withSpan } from '@nexuszero/shared';
import { getRedisConnection } from '@nexuszero/queue';
import type { OnboardingPayload } from '@nexuszero/queue';
import { OnboardingStateMachine } from './state-machine.js';
import { OAuthConnectStep } from './steps/oauth-connect.js';
import { InstantAuditStep } from './steps/instant-audit.js';
import { ProvisionStep } from './steps/provision.js';
import { StrategyGenerateStep } from './steps/strategy-generate.js';
import { GoLiveStep } from './steps/go-live.js';

export class OnboardingWorker {
  private worker: Worker | null = null;

  private oauthConnect = new OAuthConnectStep();
  private instantAudit = new InstantAuditStep();
  private provision = new ProvisionStep();
  private strategyGenerate = new StrategyGenerateStep();
  private goLive = new GoLiveStep();

  start() {
    this.worker = new Worker<OnboardingPayload>(
      QUEUE_NAMES.ONBOARDING,
      async (job) => this.processStep(job),
      {
        connection: getRedisConnection() as any,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`Onboarding step ${job.data.step} for tenant ${job.data.tenantId} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Onboarding step ${job?.data.step} for tenant ${job?.data.tenantId} failed:`, err.message);
    });

    console.log('Onboarding worker started');
  }

  async stop() {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  private async processStep(job: Job<OnboardingPayload>): Promise<void> {
    const { tenantId, step, config } = job.data;
    const sm = new OnboardingStateMachine(tenantId);

    try {
      const result = await withSpan('onboarding.step.process', {
        tracerName: 'nexuszero.onboarding-service',
        kind: spanKindForMessagingConsumer(),
        parentContext: extractTraceContext(job.data.traceContext),
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.destination.name': QUEUE_NAMES.ONBOARDING,
          'nexuszero.tenant.id': tenantId,
          'nexuszero.onboarding.step': step,
        },
      }, async () => {
        switch (step) {
          case 'oauth_connect':
            return this.oauthConnect.execute(tenantId, config);
          case 'instant_audit':
            return this.instantAudit.execute(tenantId, config);
          case 'provision':
            return this.provision.execute(tenantId, config);
          case 'strategy_generate':
            return this.strategyGenerate.execute(tenantId, config);
          case 'go_live':
            return this.goLive.execute(tenantId, config);
          default:
            throw new Error(`Unknown onboarding step: ${step}`);
        }
      });

      await sm.onStepComplete(step, result);
    } catch (err: any) {
      await sm.onStepFailed(step, err.message);
      throw err;
    }
  }
}
