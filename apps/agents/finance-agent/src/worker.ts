import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import { CfoBriefingHandler } from './handlers/cfo-briefing.js';
import { CostEstimateHandler } from './handlers/cost-estimate.js';
import { ScenarioModelHandler } from './handlers/scenario-model.js';

const cfoBriefing = new CfoBriefingHandler();
const costEstimate = new CostEstimateHandler();
const scenarioModel = new ScenarioModelHandler();

export class FinanceWorker extends BaseAgentWorker {
  constructor() {
    super({
      baseQueueName: 'finance-tasks',
      concurrency: 3,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'finance-agent',
    });
  }

  async processTask(task: any, job: Job): Promise<any> {
    switch (task.taskType) {
      case 'cfo_briefing':
        return cfoBriefing.execute(task.input, job);
      case 'cost_estimate':
        return costEstimate.execute(task.input, job);
      case 'scenario_model':
        return scenarioModel.execute(task.input, job);
      default:
        throw new Error(`Unknown finance task type: ${task.taskType}`);
    }
  }
}
