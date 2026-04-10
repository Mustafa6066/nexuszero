import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { IcpBuilderHandler } from './handlers/icp-builder.js';
import { LeadScorerHandler } from './handlers/lead-scorer.js';
import { DealResurrectorHandler } from './handlers/deal-resurrector.js';
import { PipelineForecastHandler } from './handlers/pipeline-forecast.js';
import { ObjectionHandlerHandler } from './handlers/objection-handler.js';
import { CallAnalyzerHandler } from './handlers/call-analyzer.js';
import { WinLossAnalyzerHandler } from './handlers/win-loss-analyzer.js';
import { LeadSuppressorHandler } from './handlers/lead-suppressor.js';
import { TerritoryAssignerHandler } from './handlers/territory-assigner.js';
import { PricingPatternHandler } from './handlers/pricing-patterns.js';

export class SalesPipelineWorker extends BaseAgentWorker {
  readonly agentType = 'sales-pipeline' as const;

  constructor() {
    super({
      baseQueueName: 'sales-pipeline-tasks',
      concurrency: 5,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'sales-pipeline',
    });
  }

  private icpBuilder = new IcpBuilderHandler();
  private leadScorer = new LeadScorerHandler();
  private dealResurrector = new DealResurrectorHandler();
  private pipelineForecast = new PipelineForecastHandler();
  private objectionHandler = new ObjectionHandlerHandler();
  private callAnalyzer = new CallAnalyzerHandler();
  private winLossAnalyzer = new WinLossAnalyzerHandler();
  private leadSuppressor = new LeadSuppressorHandler();
  private territoryAssigner = new TerritoryAssignerHandler();
  private pricingPattern = new PricingPatternHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const { taskType, payload } = task;

    switch (taskType) {
      case 'icp_build':
        return this.icpBuilder.execute(payload, job);
      case 'lead_score':
        return this.leadScorer.execute(payload, job);
      case 'deal_resurrection':
        return this.dealResurrector.execute(payload, job);
      case 'pipeline_forecast':
        return this.pipelineForecast.execute(payload, job);
      case 'objection_battlecard':
        return this.objectionHandler.execute(payload, job);
      case 'call_analysis':
        return this.callAnalyzer.execute(payload, job);
      case 'win_loss_analysis':
        return this.winLossAnalyzer.execute(payload, job);
      case 'lead_suppression':
        return this.leadSuppressor.execute(payload, job);
      case 'territory_assignment':
        return this.territoryAssigner.execute(payload, job);
      case 'pricing_pattern_recommend':
        return this.pricingPattern.execute(payload, job);
      default:
        throw new Error(`Unknown Sales Pipeline task type: ${taskType}`);
    }
  }
}
