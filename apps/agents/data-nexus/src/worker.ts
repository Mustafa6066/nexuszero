import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { DailyAnalysisHandler } from './handlers/daily-analysis.js';
import { AnomalyDetectionHandler } from './handlers/anomaly-detection.js';
import { ForecastingHandler } from './handlers/forecasting.js';
import { CompoundInsightsHandler } from './handlers/compound-insights.js';
import { PerformancePredictionHandler } from './handlers/performance-prediction.js';

export class DataNexusWorker extends BaseAgentWorker {
  readonly agentType = 'data-nexus' as const;

  constructor() {
    super({
      baseQueueName: 'data-tasks',
      concurrency: 5,
      heartbeatIntervalMs: 30_000,
      agentLabel: 'data-nexus',
    });
  }

  private dailyAnalysis = new DailyAnalysisHandler();
  private anomalyDetection = new AnomalyDetectionHandler();
  private forecasting = new ForecastingHandler();
  private compoundInsights = new CompoundInsightsHandler();
  private performancePrediction = new PerformancePredictionHandler();

  protected async processTask(task: TaskPayload, job: Job<TaskPayload>): Promise<Record<string, unknown>> {
    const { taskType, payload } = task;

    switch (taskType) {
      case 'daily_analysis':
        return this.dailyAnalysis.execute(payload, job);
      case 'investigate_anomaly':
        return this.anomalyDetection.execute(payload, job);
      case 'forecast':
        return this.forecasting.execute(payload, job);
      case 'compound_insights':
        return this.compoundInsights.execute(payload, job);
      case 'predict_performance':
        return this.performancePrediction.execute(payload, job);
      default:
        throw new Error(`Unknown Data Nexus task type: ${taskType}`);
    }
  }
}
