# Release Readiness

This checklist captures the validation surface added during the enterprise hardening pass.

## Scope

The current release-readiness sweep covers:

- tenant-scoped DB session enforcement
- Kafka and BullMQ trace propagation
- assistant market-aware Arabic prompt behavior
- onboarding worker span extraction and failure handling
- webhook-service traced consumer behavior and startup failure handling
- compatibility-agent OTEL bootstrap, connector registration, cron wiring, and worker startup
- orchestrator traced consumer behavior, startup failure handling, and poll backoff logic
- Hybrid Brain package integration into the orchestrator control plane plus package test, typecheck, and build coverage
- shared MENA localization helpers
- SEO Arabic validation and circuit-breaker behavior

## Targeted Test Matrix

- `packages/db/src/client.test.ts`
- `packages/queue/src/kafka-client.test.ts`
- `packages/queue/src/producers.test.ts`
- `packages/shared/src/utils/mena.test.ts`
- `packages/brain/tests/dynamic-dag-builder.test.ts`
- `packages/brain/tests/rollback-planner.test.ts`
- `packages/brain/tests/mission-fsm.test.ts`
- `packages/brain/tests/reaction-engine.test.ts`
- `apps/api-gateway/tests/tenant-isolation.test.ts`
- `apps/api-gateway/tests/intelligence-summary.test.ts`
- `apps/api-gateway/tests/gateway.test.ts`
- `apps/api-gateway/tests/assistant-language.test.ts`
- `apps/api-gateway/tests/assistant-chat.test.ts`
- `apps/onboarding-service/src/worker.test.ts`
- `apps/orchestrator/src/task-router.test.ts`
- `apps/orchestrator/tests/index.test.ts`
- `apps/webhook-service/tests/index.test.ts`
- `apps/compatibility-agent/tests/index.test.ts`
- `apps/agents/seo-agent/src/llm.test.ts`

Hybrid Brain package coverage now includes task DAG generation, rollback persistence, mission transitions, and reaction escalation behavior.

## Targeted Build Matrix

- `@nexuszero/shared`
- `@nexuszero/db`
- `@nexuszero/queue`
- `@nexuszero/brain`
- `@nexuszero/api-gateway`
- `@nexuszero/onboarding-service`
- `@nexuszero/orchestrator`
- `@nexuszero/webhook-service`
- `@nexuszero/compatibility-agent`
- `@nexuszero/seo-agent`
- `@nexuszero/ad-agent`

## CI Commands

```powershell
corepack pnpm --filter @nexuszero/shared build
corepack pnpm exec vitest run packages/db/src/client.test.ts packages/queue/src/kafka-client.test.ts packages/queue/src/producers.test.ts packages/shared/src/utils/mena.test.ts packages/brain/tests/dynamic-dag-builder.test.ts packages/brain/tests/rollback-planner.test.ts packages/brain/tests/mission-fsm.test.ts packages/brain/tests/reaction-engine.test.ts apps/api-gateway/tests/tenant-isolation.test.ts apps/api-gateway/tests/intelligence-summary.test.ts apps/api-gateway/tests/gateway.test.ts apps/api-gateway/tests/assistant-language.test.ts apps/api-gateway/tests/assistant-chat.test.ts apps/onboarding-service/src/worker.test.ts apps/orchestrator/src/task-router.test.ts apps/orchestrator/tests/index.test.ts apps/webhook-service/tests/index.test.ts apps/compatibility-agent/tests/index.test.ts apps/agents/seo-agent/src/llm.test.ts
corepack pnpm --filter @nexuszero/db build
corepack pnpm --filter @nexuszero/queue build
corepack pnpm --filter @nexuszero/brain typecheck
corepack pnpm --filter @nexuszero/brain build
corepack pnpm --filter @nexuszero/api-gateway build
corepack pnpm --filter @nexuszero/onboarding-service build
corepack pnpm --filter @nexuszero/orchestrator build
corepack pnpm --filter @nexuszero/webhook-service build
corepack pnpm --filter @nexuszero/compatibility-agent build
corepack pnpm --filter @nexuszero/seo-agent build
corepack pnpm --filter @nexuszero/ad-agent build
```

## Release Gate

Ship only when all targeted tests pass, `@nexuszero/brain` typechecks cleanly, and all packages in the build matrix compile without manual environment patches.