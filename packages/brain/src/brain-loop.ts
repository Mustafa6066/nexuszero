import { randomUUID } from 'node:crypto';
import type {
  BrainConfig,
  BrainState,
  DynamicTaskPlan,
  OperatingPicture,
  ReasoningResult,
} from './types.js';
import { DEFAULT_BRAIN_CONFIG } from './types.js';
import { SignalAggregator } from './perception/signal-aggregator.js';
import { StateCollector } from './perception/state-collector.js';
import { TenantContextBuilder } from './perception/tenant-context-builder.js';
import { PriorityScorer } from './reasoning/priority-scorer.js';
import { ImpactAnalyzer } from './reasoning/impact-analyzer.js';
import { StrategyEvaluator } from './reasoning/strategy-evaluator.js';
import { DynamicDagBuilder } from './planning/dynamic-dag-builder.js';
import { ReactionEngine } from './reactions/reaction-engine.js';

// ---------------------------------------------------------------------------
// Brain Loop — Core perception → reasoning → planning → dispatch → learn cycle
//
// The Brain runs on a fixed cadence (default 30s). Each tick:
// 1. Perceive — aggregate signals, collect fleet/integration state
// 2. Reason  — score opportunities, evaluate strategies, compute blast radii
// 3. Plan    — generate dynamic task DAGs from scored opportunities
// 4. React   — process reaction triggers (failures, anomalies, degradation)
// 5. Learn   — update intelligence layers on their own cadences
// ---------------------------------------------------------------------------

export class BrainLoop {
  private interval: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastTemporalRefresh = 0;
  private lastDecisionCheck = 0;
  private lastStaleDetection = 0;
  private running = false;

  private readonly signalAggregator: SignalAggregator;
  private readonly stateCollector: StateCollector;
  private readonly contextBuilder: TenantContextBuilder;
  private readonly priorityScorer: PriorityScorer;
  private readonly impactAnalyzer: ImpactAnalyzer;
  private readonly strategyEvaluator: StrategyEvaluator;
  private readonly dagBuilder: DynamicDagBuilder;
  private readonly reactionEngine: ReactionEngine;

  constructor(
    private readonly config: BrainConfig = DEFAULT_BRAIN_CONFIG,
    private readonly onPlansGenerated?: (plans: DynamicTaskPlan[]) => Promise<void>,
  ) {
    this.signalAggregator = new SignalAggregator();
    this.stateCollector = new StateCollector();
    this.contextBuilder = new TenantContextBuilder();
    this.priorityScorer = new PriorityScorer();
    this.impactAnalyzer = new ImpactAnalyzer();
    this.strategyEvaluator = new StrategyEvaluator();
    this.dagBuilder = new DynamicDagBuilder();
    this.reactionEngine = new ReactionEngine();
  }

  /** Start the brain loop for a set of tenant IDs */
  start(tenantIds: string[]): void {
    if (this.running) return;
    if (!this.config.enabled) {
      console.log(JSON.stringify({ level: 'info', msg: 'Brain is disabled, skipping start' }));
      return;
    }

    this.running = true;

    this.interval = setInterval(async () => {
      for (const tenantId of tenantIds) {
        try {
          await this.tick(tenantId);
        } catch (err) {
          console.log(JSON.stringify({
            level: 'error',
            msg: 'Brain tick failed',
            tenantId,
            error: (err as Error).message,
            tickCount: this.tickCount,
          }));
        }
      }
    }, this.config.tickIntervalMs);

    console.log(JSON.stringify({
      level: 'info',
      msg: 'Brain loop started',
      tenantCount: tenantIds.length,
      tickIntervalMs: this.config.tickIntervalMs,
    }));
  }

  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log(JSON.stringify({ level: 'info', msg: 'Brain loop stopped', tickCount: this.tickCount }));
  }

  /** Execute a single brain tick for one tenant */
  async tick(tenantId: string): Promise<BrainState> {
    this.tickCount += 1;
    const tickStart = Date.now();

    // === Phase 1: Perceive ===
    const operatingPicture = await this.perceive(tenantId);

    // === Phase 2: Reason ===
    const reasoning = await this.reason(tenantId, operatingPicture);

    // === Phase 3: Plan ===
    const plans = await this.plan(tenantId, reasoning, operatingPicture);

    // === Phase 4: React ===
    await this.react(tenantId, operatingPicture, reasoning);

    // === Phase 5: Learn (cadence-gated) ===
    await this.refreshIntelligence(tenantId, tickStart);

    // Dispatch generated plans
    if (plans.length > 0 && this.onPlansGenerated) {
      await this.onPlansGenerated(plans);
    }

    const state: BrainState = {
      tenantId,
      operatingPicture,
      reasoning,
      activeMissions: [],
      pendingReactions: this.reactionEngine.getPendingReactions(tenantId),
      lastTickAt: new Date(),
      tickCount: this.tickCount,
    };

    console.log(JSON.stringify({
      level: 'info',
      msg: 'Brain tick completed',
      tenantId,
      tickCount: this.tickCount,
      durationMs: Date.now() - tickStart,
      signalsProcessed: operatingPicture.signals.signals.length,
      opportunitiesScored: reasoning.opportunities.length,
      plansGenerated: plans.length,
    }));

    return state;
  }

  /** Process a batch of signals immediately (called from orchestrator Kafka consumer) */
  async processSignals(tenantId: string, signals: unknown[]): Promise<DynamicTaskPlan[]> {
    if (!this.config.enabled) return [];

    const operatingPicture = await this.perceive(tenantId, signals);
    const reasoning = await this.reason(tenantId, operatingPicture);
    const plans = await this.plan(tenantId, reasoning, operatingPicture);

    await this.react(tenantId, operatingPicture, reasoning);

    return plans;
  }

  private async perceive(tenantId: string, incomingSignals?: unknown[]): Promise<OperatingPicture> {
    const [signalSnapshot, fleetState] = await Promise.all([
      this.signalAggregator.collect(tenantId, this.config.tickIntervalMs, incomingSignals),
      this.stateCollector.collect(tenantId),
    ]);

    return this.contextBuilder.build(tenantId, signalSnapshot, fleetState);
  }

  private async reason(tenantId: string, picture: OperatingPicture): Promise<ReasoningResult> {
    const [opportunities, strategyEvals] = await Promise.all([
      this.priorityScorer.score(tenantId, picture),
      this.strategyEvaluator.evaluate(tenantId, picture),
    ]);

    // Compute blast radius only for high-impact opportunities
    const highImpact = opportunities.filter(o => o.compositeScore > 0.7);
    const blastRadii = await Promise.all(
      highImpact.map(o => this.impactAnalyzer.analyze(o.suggestedTaskType, tenantId, picture)),
    );

    return {
      tenantId,
      opportunities,
      blastRadii,
      strategyEvaluations: strategyEvals,
      reasonedAt: new Date(),
    };
  }

  private async plan(
    tenantId: string,
    reasoning: ReasoningResult,
    picture: OperatingPicture,
  ): Promise<DynamicTaskPlan[]> {
    // Only plan for safe or already-analyzed opportunities
    const actionable = reasoning.opportunities.filter(o => {
      const blast = reasoning.blastRadii.find(b => b.taskType === o.suggestedTaskType);
      // Skip critical blast radius unless explicitly approved
      return !blast || blast.riskLevel !== 'critical';
    });

    if (actionable.length === 0) return [];

    return this.dagBuilder.buildPlans(tenantId, actionable, picture);
  }

  private async react(
    tenantId: string,
    picture: OperatingPicture,
    reasoning: ReasoningResult,
  ): Promise<void> {
    await this.reactionEngine.processReactions(tenantId, picture, reasoning);
  }

  private async refreshIntelligence(tenantId: string, tickStart: number): Promise<void> {
    // Temporal refresh (hourly)
    if (tickStart - this.lastTemporalRefresh >= this.config.temporalRefreshMs) {
      this.lastTemporalRefresh = tickStart;
      // Temporal analysis is handled lazily — data fetched in next reasoning pass
    }

    // Decision health check (daily)
    if (tickStart - this.lastDecisionCheck >= this.config.decisionHealthMs) {
      this.lastDecisionCheck = tickStart;
      await this.strategyEvaluator.runDecisionHealthCheck(tenantId);
    }

    // Stale detection (weekly)
    if (tickStart - this.lastStaleDetection >= this.config.staleDetectionMs) {
      this.lastStaleDetection = tickStart;
      // Stale detection runs via the strategy evaluator
      await this.strategyEvaluator.detectStaleStrategies(tenantId);
    }
  }
}
