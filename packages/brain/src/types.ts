import { z } from 'zod';
import type { SignalType, TypedSignal } from '@nexuszero/queue';
import type { AgentType, TaskPriority } from '@nexuszero/shared';

// ---------------------------------------------------------------------------
// Hybrid Brain — Core Type Definitions
//
// The Brain is a 6-layer intelligence engine that perceives, reasons, plans,
// dispatches, and learns — making the agent swarm operate as a single
// coordinated organism.
// ---------------------------------------------------------------------------

// ---- Agent Activity States (extended beyond idle/processing) ----

export type AgentActivityState =
  | 'active'
  | 'ready'
  | 'idle'
  | 'waiting_input'
  | 'blocked'
  | 'degraded'
  | 'learning'
  | 'planning';

export interface BlockReason {
  type: 'waiting_api' | 'waiting_approval' | 'waiting_data' | 'waiting_dependency' | 'rate_limited';
  detail: string;
  blockedSince: Date;
}

// ---- Signal Snapshot (Perception) ----

export interface SignalSnapshot {
  tenantId: string;
  signals: TypedSignal[];
  collectedAt: Date;
  windowMs: number;
}

// ---- Agent Fleet State (Perception) ----

export interface AgentState {
  agentId: string;
  agentType: string;
  activity: AgentActivityState;
  activeJobs: number;
  queueDepth: number;
  healthScore: number;
  lastHeartbeat: Date | null;
  blockReason?: BlockReason;
  recentSuccessRate: number;
  avgProcessingTimeMs: number;
}

export interface AgentFleetState {
  tenantId: string;
  agents: AgentState[];
  totalActiveJobs: number;
  totalQueuedJobs: number;
  fleetHealthScore: number;
  collectedAt: Date;
}

// ---- Operating Picture (Perception + Intelligence) ----

export interface IntegrationHealth {
  integrationId: string;
  platform: string;
  status: 'healthy' | 'degraded' | 'error' | 'disconnected';
  errorRate: number;
  lastSyncAt: Date | null;
}

export interface RecentOutcome {
  taskId: string;
  taskType: string;
  agentType: string;
  status: 'completed' | 'failed';
  durationMs: number;
  completedAt: Date;
  impact?: Record<string, unknown>;
}

export interface OperatingPicture {
  tenantId: string;
  signals: SignalSnapshot;
  fleet: AgentFleetState;
  integrations: IntegrationHealth[];
  recentOutcomes: RecentOutcome[];
  activeStrategies: StrategyDecisionRecord[];
  kpiSnapshot: Record<string, number>;
  generatedAt: Date;
}

// ---- Reasoning Results ----

export interface ScoredOpportunity {
  id: string;
  description: string;
  impactScore: number;
  readinessScore: number;
  riskScore: number;
  compositeScore: number;
  suggestedTaskType: string;
  suggestedAgentType: string;
  reasoning: string;
  relatedSignals: string[];
}

export interface BlastRadiusResult {
  taskType: string;
  directlyAffected: string[];
  transitivelyAffected: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedPrecautions: string[];
}

export interface StrategyEvaluation {
  strategyId: string;
  status: 'healthy' | 'stale' | 'conflicting' | 'underperforming';
  reason: string;
  driftPercent: number;
  suggestedAction?: string;
}

export interface ReasoningResult {
  tenantId: string;
  opportunities: ScoredOpportunity[];
  blastRadii: BlastRadiusResult[];
  strategyEvaluations: StrategyEvaluation[];
  reasonedAt: Date;
}

// ---- Dynamic Task Planning ----

export interface PlannedTask {
  id: string;
  taskType: string;
  agentType: string;
  priority: TaskPriority;
  input: Record<string, unknown>;
  dependsOn: string[];
  rollbackAction?: string;
  estimatedDurationMs?: number;
}

export interface DynamicTaskPlan {
  id: string;
  tenantId: string;
  missionId?: string;
  tasks: PlannedTask[];
  reasoning: string;
  estimatedTotalDurationMs: number;
  rollbackPlan: RollbackStep[];
  createdAt: Date;
}

export interface RollbackStep {
  taskId: string;
  action: string;
  description: string;
}

// ---- Mission Lifecycle ----

export type MissionStatus =
  | 'planning'
  | 'dispatching'
  | 'executing'
  | 'reviewing'
  | 'adjusting'
  | 'completed'
  | 'failed'
  | 'diagnosing'
  | 're-planning'
  | 'cancelled';

export interface MissionOutcome {
  taskId: string;
  taskType: string;
  agentType: string;
  status: 'completed' | 'failed';
  durationMs: number;
  cost: number;
  result?: Record<string, unknown>;
}

export interface Mission {
  id: string;
  tenantId: string;
  goal: string;
  status: MissionStatus;
  taskPlan: DynamicTaskPlan;
  agentAssignments: Record<string, string[]>;
  outcomes: MissionOutcome[];
  totalCost: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

// ---- Reaction System ----

export type ReactionTrigger =
  | 'task-failed'
  | 'signal-anomaly'
  | 'strategy-stale'
  | 'budget-threshold'
  | 'agent-degraded'
  | 'approval-timeout'
  | 'integration-error'
  | 'kpi-drift';

export type ReactionAction =
  | 'diagnose-and-retry'
  | 'investigate-and-adjust'
  | 'propose-strategy-update'
  | 'throttle-and-notify'
  | 'redistribute-load'
  | 'escalate-to-manager'
  | 'auto-reconnect'
  | 'pause-agent';

export interface ReactionConfig {
  trigger: ReactionTrigger;
  auto: boolean;
  action: ReactionAction;
  retries?: number;
  maxRetries?: number;
  escalateAfterMs?: number;
  threshold?: number;
  budgetThresholdPercent?: number;
  cooldownMs?: number;
}

export interface ReactionEvent {
  id: string;
  tenantId: string;
  trigger: ReactionTrigger;
  action?: ReactionAction;
  context: Record<string, unknown>;
  sourceEvent?: Record<string, unknown>;
  sourceAgentType?: string;
  result?: Record<string, unknown>;
  status: 'pending' | 'executing' | 'completed' | 'escalated' | 'failed';
  attempts: number;
  startedAt: Date;
  completedAt?: Date;
  escalatedAt?: Date;
}

// ---- Strategy Decision Records (inspired by Repowise) ----

export interface StrategyDecisionRecord {
  id: string;
  tenantId: string;
  title: string;
  rationale: string;
  governedAgents: string[];
  governedChannels: string[];
  expectedOutcome: string;
  expectedMetrics: Record<string, number>;
  actualMetrics?: Record<string, number>;
  status: 'active' | 'stale' | 'conflicting' | 'superseded' | 'archived';
  stalenessThreshold: number;
  createdAt: Date;
  lastCheckedAt: Date;
  supersededBy?: string;
}

// ---- Intelligence Layer Outputs ----

export interface SignalImportanceScore {
  signalType: SignalType;
  importanceScore: number;
  consumerCount: number;
  outcomeCorrelation: number;
}

export interface TaskHotspot {
  taskType: string;
  agentType: string;
  hotspotScore: number;
  failureRate: number;
  avgRetries: number;
  trend: 'improving' | 'stable' | 'worsening';
}

export interface AgentExpertise {
  agentType: string;
  taskType: string;
  successRate: number;
  avgDurationMs: number;
  volumeLast30d: number;
  isSinglePointOfFailure: boolean;
}

export interface StaleItem {
  type: 'strategy' | 'integration' | 'agent_capability';
  id: string;
  name: string;
  lastActiveAt: Date;
  daysSinceActive: number;
  recommendation: string;
}

export interface CostEfficiency {
  agentType: string;
  costPerTask: number;
  costPerOutcome: number;
  modelBreakdown: Record<string, number>;
  optimizationSuggestion?: string;
}

export interface PredictionResult {
  metric: string;
  currentValue: number;
  predictedValue: number;
  confidence: number;
  timeHorizon: string;
  suggestedIntervention?: string;
}

// ---- Brain State (top-level) ----

export interface BrainState {
  tenantId: string;
  operatingPicture: OperatingPicture;
  reasoning: ReasoningResult;
  activeMissions: Mission[];
  pendingReactions: ReactionEvent[];
  lastTickAt: Date;
  tickCount: number;
}

// ---- Brain Configuration ----

export interface BrainConfig {
  /** Core loop interval in ms (default: 30_000) */
  tickIntervalMs: number;
  /** Temporal intelligence refresh cadence in ms (default: 3_600_000 = 1h) */
  temporalRefreshMs: number;
  /** Decision health check cadence in ms (default: 86_400_000 = 24h) */
  decisionHealthMs: number;
  /** Stale strategy scan cadence in ms (default: 604_800_000 = 7d) */
  staleDetectionMs: number;
  /** Max LLM budget per tenant per month for Brain reasoning (fraction 0-1 of total budget) */
  brainBudgetFraction: number;
  /** Feature flag — Brain is opt-in per tenant */
  enabled: boolean;
}

export const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  tickIntervalMs: 30_000,
  temporalRefreshMs: 3_600_000,
  decisionHealthMs: 86_400_000,
  staleDetectionMs: 604_800_000,
  brainBudgetFraction: 0.05,
  enabled: false,
};

// ---- Reaction Config Defaults ----

export const DEFAULT_REACTION_CONFIGS: ReactionConfig[] = [
  { trigger: 'task-failed', auto: true, action: 'diagnose-and-retry', retries: 2, escalateAfterMs: 15 * 60_000 },
  { trigger: 'signal-anomaly', auto: true, action: 'investigate-and-adjust', cooldownMs: 5 * 60_000 },
  { trigger: 'strategy-stale', auto: false, action: 'propose-strategy-update' },
  { trigger: 'budget-threshold', auto: true, action: 'throttle-and-notify', budgetThresholdPercent: 80 },
  { trigger: 'agent-degraded', auto: true, action: 'redistribute-load', escalateAfterMs: 10 * 60_000 },
  { trigger: 'approval-timeout', auto: true, action: 'escalate-to-manager', escalateAfterMs: 2 * 3_600_000 },
  { trigger: 'integration-error', auto: true, action: 'auto-reconnect', retries: 3, escalateAfterMs: 30 * 60_000 },
  { trigger: 'kpi-drift', auto: false, action: 'investigate-and-adjust' },
];

// ---- Zod Schemas for validation ----

export const ReactionConfigSchema = z.object({
  trigger: z.enum([
    'task-failed', 'signal-anomaly', 'strategy-stale', 'budget-threshold',
    'agent-degraded', 'approval-timeout', 'integration-error', 'kpi-drift',
  ]),
  auto: z.boolean(),
  action: z.enum([
    'diagnose-and-retry', 'investigate-and-adjust', 'propose-strategy-update',
    'throttle-and-notify', 'redistribute-load', 'escalate-to-manager',
    'auto-reconnect', 'pause-agent',
  ]),
  retries: z.number().int().min(0).optional(),
  maxRetries: z.number().int().min(0).optional(),
  escalateAfterMs: z.number().int().min(0).optional(),
  threshold: z.number().min(0).max(1).optional(),
  budgetThresholdPercent: z.number().min(0).max(100).optional(),
  cooldownMs: z.number().int().min(0).optional(),
});

export const BrainConfigSchema = z.object({
  tickIntervalMs: z.number().int().min(5_000),
  temporalRefreshMs: z.number().int().min(60_000),
  decisionHealthMs: z.number().int().min(3_600_000),
  staleDetectionMs: z.number().int().min(86_400_000),
  brainBudgetFraction: z.number().min(0).max(0.2),
  enabled: z.boolean(),
});
