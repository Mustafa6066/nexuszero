# Hybrid Brain Deep Dive

The Hybrid Brain is the tenant-aware control layer that runs inside the orchestrator through `@nexuszero/brain`. It turns Kafka signals, queue state, agent health, integration health, and recent outcomes into dynamic task plans, reactions, mission state, and richer downstream execution context.

## Runtime Model

- `@nexuszero/brain` is an internal package, not a separate deployable service.
- The orchestrator drives the Brain in two ways:
  - scheduled tenant ticks through the main `BrainLoop`
  - immediate signal-driven reasoning through `processSignals()` when Kafka events arrive
- Brain rollout is tenant-scoped through orchestrator controls such as `BRAIN_TENANT_IDS`.
- Default cadences are package-configured: 30s control ticks, hourly temporal refresh, daily decision health checks, and weekly stale-strategy detection.

## Control Loop

### 1. Perceive

The perception phase builds a tenant operating picture from multiple sources:

- `SignalAggregator` collects the current signal window.
- `StateCollector` snapshots fleet health, queue depth, and recent activity.
- `TenantContextBuilder` joins integrations, recent outcomes, active strategies, and KPI context into a single `OperatingPicture`.

The output is the Brain's shared fact model for the rest of the tick.

### 2. Reason

The reasoning phase converts the operating picture into prioritized opportunities and risk checks:

- `PriorityScorer` ranks candidate opportunities.
- `StrategyEvaluator` detects stale or drifting strategy.
- `ImpactAnalyzer` computes blast radius for high-impact actions before planning proceeds.

This produces a `ReasoningResult` containing scored opportunities, blast-radius analysis, and strategy evaluations.

### 3. Plan

The planning phase converts safe opportunities into executable multi-step work:

- `DynamicDagBuilder` creates dependency-aware `DynamicTaskPlan` DAGs.
- follow-up tasks are only added when downstream agent capacity and health support them.
- each plan carries a rollback plan so the orchestrator can unwind generated work when execution fails.
- `RollbackPlanner` persists rollback steps by plan ID for later recovery.

The Brain therefore plans around sequences and reversibility, not just individual tasks.

### 4. React

The reaction phase handles degraded runtime conditions and control-plane exceptions.

Default reaction configs currently cover:

- `task-failed` -> `diagnose-and-retry`
- `signal-anomaly` -> `investigate-and-adjust`
- `strategy-stale` -> `propose-strategy-update`
- `budget-threshold` -> `throttle-and-notify`
- `agent-degraded` -> `redistribute-load`
- `integration-error` -> `auto-reconnect`
- `approval-timeout` -> `escalate-to-manager`
- `kpi-drift` -> `investigate-and-adjust`

`ReactionEngine` derives or executes these reactions, while `EscalationManager` handles the paths that need human review or recovery after automated attempts fail.

### 5. Learn And Coordinate

The Brain also maintains slower-moving intelligence and consistency checks:

- `TemporalAnalysis` highlights hotspots and handler churn.
- `DecisionRecords` stores strategy decisions and rationale.
- `PredictionEngine` surfaces pattern matches from prior outcomes.
- `CostIntelligence` tracks tenant spend efficiency and budget pressure.
- `StaleDetector` flags aging strategy and execution context.
- `ExpertiseMap` tracks which agents are best suited to which work.
- `StoreCoordinator` checks PostgreSQL vs Redis drift and repairs Redis state from PostgreSQL truth when needed.
- `PromptAssembler` builds 4-layer execution prompts: base instruction, operating context, task directives, and historical outcome patterns.

## Package Layout

Key source areas under `packages/brain/src/`:

- `brain-loop.ts`: orchestrates the perceive -> reason -> plan -> react -> learn cycle
- `perception/`: signal aggregation, fleet collection, tenant context assembly
- `reasoning/`: opportunity scoring, blast-radius analysis, strategy evaluation
- `planning/`: DAG generation and rollback planning
- `reactions/`: reaction engine, escalation logic, and action handlers
- `missions/`: mission lifecycle finite-state machine
- `intelligence/`: cost, prediction, stale detection, temporal analysis, expertise, decision records
- `context/`: prompt assembly for downstream agent execution
- `coordination/`: store drift detection and repair
- `types.ts`: shared contracts, defaults, and schemas

## State Model

The Brain works with a few primary contracts:

- `OperatingPicture`: tenant state snapshot used for reasoning
- `ReasoningResult`: prioritized opportunities, blast radius, and strategy evaluation output
- `DynamicTaskPlan`: dependency-aware work package plus rollback steps
- `Mission`: multi-step unit of work with aggregated outcomes and cost
- `ReactionEvent`: reaction trigger, action, attempts, and escalation state

Mission lifecycle states currently include:

- `planning`
- `dispatching`
- `executing`
- `reviewing`
- `adjusting`
- `diagnosing`
- `re-planning`
- `completed`
- `failed`
- `cancelled`

In practice, missions move from planning into dispatch and execution, aggregate task outcomes as work completes, then transition into review or recovery states depending on results.

## Storage Boundaries

- PostgreSQL remains the source of truth for tenant, agent, integration, and strategy records.
- Redis acts as the Brain control-plane store for missions, rollback plans, approval queues, outcome-pattern caches, drift reports, and other short-lived intelligence artifacts.
- Typed Brain-originated signals are registered in `packages/queue/src/signal-schemas.ts` so mission, strategy, degradation, budget, and store-drift events remain first-class across the platform.

## Current Validation Surface

The package now has package-local validation rather than build-only coverage.

### Commands

```bash
pnpm --filter @nexuszero/brain typecheck
pnpm --filter @nexuszero/brain test
pnpm --filter @nexuszero/brain build
```

### Unit Coverage

- `packages/brain/tests/dynamic-dag-builder.test.ts`: chained task generation and downstream-agent health gating
- `packages/brain/tests/rollback-planner.test.ts`: rollback persistence and reverse-order execution
- `packages/brain/tests/mission-fsm.test.ts`: mission creation, transition validation, and outcome-driven review progression
- `packages/brain/tests/reaction-engine.test.ts`: derived reactions, pending approvals, and escalation after handler failure

These tests were added specifically to validate the package as an independent control-plane unit, not just as an orchestrator implementation detail.

## Rollout Guidance

Recommended rollout path:

1. Run package validation for `@nexuszero/brain`.
2. Enable the Brain only for a small tenant allowlist.
3. Watch mission volume, reaction outcomes, budget-threshold behavior, and store-drift reports.
4. Expand tenant coverage once the control loop behaves predictably under real signal traffic.

The next validation step beyond package coverage is orchestrator-level end-to-end mission replay that exercises live queue dispatch, signal ingress, and recovery paths together.