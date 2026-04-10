import { BaseAgentWorker } from '@nexuszero/queue';
import type { Job } from 'bullmq';
import type { TaskPayload } from '@nexuszero/queue';
import { DailyAnalysisHandler } from './handlers/daily-analysis.js';
import { AnomalyDetectionHandler } from './handlers/anomaly-detection.js';
import { ForecastingHandler } from './handlers/forecasting.js';
import { CompoundInsightsHandler } from './handlers/compound-insights.js';
import { PerformancePredictionHandler } from './handlers/performance-prediction.js';
import { ExperimentEngineHandler } from './handlers/experiment-engine.js';
import { WeeklyScorecardHandler } from './handlers/weekly-scorecard.js';
import { PacingAlertHandler } from './handlers/pacing-alert.js';
import { RevenueAttributionHandler } from './handlers/revenue-attribution.js';
import { ClientReportHandler } from './handlers/client-report.js';

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
  private experimentEngine = new ExperimentEngineHandler();
  private weeklyScorecard = new WeeklyScorecardHandler();
  private pacingAlert = new PacingAlertHandler();
  private revenueAttribution = new RevenueAttributionHandler();
  private clientReport = new ClientReportHandler();

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
      case 'experiment_create':
      case 'experiment_score':
        return this.experimentEngine.execute(payload, job);
      case 'experiment_playbook':
        return this.experimentEngine.execute({ ...payload, action: 'evaluate' }, job);
      case 'weekly_scorecard':
        return this.weeklyScorecard.execute(payload, job);
      case 'pacing_alert':
        return this.pacingAlert.execute(payload, job);
      case 'revenue_attribution':
        return this.revenueAttribution.execute(payload, job);
      case 'client_report':
        return this.clientReport.execute(payload, job);
      default:
        throw new Error(`Unknown Data Nexus task type: ${taskType}`);
    }
  }
}
