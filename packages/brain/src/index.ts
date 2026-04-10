// ---------------------------------------------------------------------------
// @nexuszero/brain — Public API
//
// Hybrid Brain: 6-layer intelligence engine for autonomous agent swarm
// orchestration. Perceive → Reason → Plan → React → Learn.
// ---------------------------------------------------------------------------

// Core types
export type {
  AgentActivityState,
  BlockReason,
  SignalSnapshot,
  AgentState,
  AgentFleetState,
  IntegrationHealth,
  RecentOutcome,
  OperatingPicture,
  ScoredOpportunity,
  BlastRadiusResult,
  StrategyEvaluation,
  ReasoningResult,
  PlannedTask,
  DynamicTaskPlan,
  MissionOutcome,
  RollbackStep,
  MissionStatus,
  Mission,
  ReactionTrigger,
  ReactionAction,
  ReactionConfig,
  ReactionEvent,
  StrategyDecisionRecord,
  SignalImportanceScore,
  TaskHotspot,
  AgentExpertise,
  StaleItem,
  CostEfficiency,
  PredictionResult,
  BrainState,
  BrainConfig,
} from './types.js';

export {
  DEFAULT_BRAIN_CONFIG,
  DEFAULT_REACTION_CONFIGS,
  BrainConfigSchema,
  ReactionConfigSchema,
} from './types.js';

// Core loop
export { BrainLoop } from './brain-loop.js';

// Perception
export { SignalAggregator } from './perception/signal-aggregator.js';
export { StateCollector } from './perception/state-collector.js';
export { TenantContextBuilder } from './perception/tenant-context-builder.js';

// Reasoning
export { PriorityScorer } from './reasoning/priority-scorer.js';
export { ImpactAnalyzer } from './reasoning/impact-analyzer.js';
export { StrategyEvaluator } from './reasoning/strategy-evaluator.js';

// Planning
export { DynamicDagBuilder } from './planning/dynamic-dag-builder.js';
export { RollbackPlanner } from './planning/rollback-planner.js';

// Intelligence layers
export { SignalGraphIntelligence } from './intelligence/signal-graph.js';
export type { SignalEdge, SignalGraphSnapshot } from './intelligence/signal-graph.js';
export { TemporalAnalysis } from './intelligence/temporal-analysis.js';
export type { TemporalSnapshot, PerformanceWindow, HandlerChurn } from './intelligence/temporal-analysis.js';
export { OperatingContextIntelligence } from './intelligence/operating-context.js';
export { DecisionRecords } from './intelligence/decision-records.js';
export { PredictionEngine } from './intelligence/prediction-engine.js';
export type { PatternMatch } from './intelligence/prediction-engine.js';
export { CostIntelligence } from './intelligence/cost-intelligence.js';
export type { CostSnapshot } from './intelligence/cost-intelligence.js';
export { StaleDetector } from './intelligence/stale-detector.js';
export { ExpertiseMap } from './intelligence/expertise-map.js';
export type { ExpertiseMapSnapshot } from './intelligence/expertise-map.js';

// Reactions
export { ReactionEngine } from './reactions/reaction-engine.js';
export type { ReactionHandlers } from './reactions/reaction-engine.js';
export { EscalationManager } from './reactions/escalation.js';
export { DiagnoseAndRetryHandler } from './reactions/handlers/diagnose-and-retry.js';
export { InvestigateAndAdjustHandler } from './reactions/handlers/investigate-and-adjust.js';
export { ProposeStrategyUpdateHandler } from './reactions/handlers/propose-strategy-update.js';
export { ThrottleAndNotifyHandler } from './reactions/handlers/throttle-and-notify.js';
export { RedistributeLoadHandler } from './reactions/handlers/redistribute-load.js';

// Missions
export { MissionFSM } from './missions/mission-fsm.js';

// Context
export { PromptAssembler } from './context/prompt-assembler.js';
export type { PromptLayers, AssembledPrompt } from './context/prompt-assembler.js';

// Coordination
export { StoreCoordinator } from './coordination/store-coordinator.js';
export type { StoreDriftReport, StoreDrift } from './coordination/store-coordinator.js';
