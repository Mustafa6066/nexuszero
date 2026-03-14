# Enterprise Ops Guide

This document describes the enterprise runtime additions introduced for NexusZero's production platform hardening.

## Observability

- Shared OpenTelemetry bootstrap and trace helpers live in `packages/shared/src/utils/observability.ts`.
- Set `OTEL_EXPORTER_OTLP_ENDPOINT` to your collector or vendor ingress endpoint.
- Services now boot tracing in:
  - `apps/api-gateway`
  - `apps/orchestrator`
  - `apps/webhook-service`
  - `apps/onboarding-service`
  - `apps/compatibility-agent`
  - `apps/agents/seo-agent`
  - `apps/agents/ad-agent`
  - `apps/agents/data-nexus`
  - `apps/agents/aeo-agent`
- Trace context is propagated across:
  - HTTP requests at the API gateway
  - BullMQ task processing in shared worker infrastructure
  - Kafka publish/consume flows used by orchestrator and webhook service
  - Onboarding queue jobs

## Tenant Isolation

- `packages/db/src/client.ts` now applies `set_config('app.current_tenant_id', tenantId, true)` inside a transaction and uses `SET LOCAL ROLE nexuszero_app` by default.
- Required runtime variables:
  - `DATABASE_APP_ROLE=nexuszero_app`
  - `DB_ENFORCE_RLS=true`
- If a maintenance environment must bypass role enforcement, set `DB_ENFORCE_RLS=false` explicitly.

## Terraform

The foundational IaC is under `terraform/`.

- `main.tf` provisions:
  - AWS RDS PostgreSQL 16 with encrypted storage, backups, and PITR retention
  - Cloudflare R2 bucket for asset storage
  - Cloudflare WAF custom ruleset with geo-sensitive controls
- `variables.tf` defines the environment-specific inputs.

Suggested workflow:

1. Create a dedicated backend and workspace for `production` and `staging`.
2. Supply Cloudflare and AWS credentials through your CI secret store.
3. Run `terraform plan` in staging first.
4. Validate WAF expressions against your real zone traffic before applying to production.

## Kubernetes / Helm

The worker migration chart is under `deploy/helm/nexuszero-workers/`.

- Use `Deployment` templates for stateless horizontally-scaled workers.
- Use `StatefulSet` templates for cache-heavy or storage-sensitive worker pools.
- Configure:
  - image tags
  - OTEL endpoint
  - secret names for Redis, Kafka, and Postgres
  - HPA min/max replica settings

Suggested rollout:

1. Move `seo-agent` and `data-nexus` first as deployment-backed workers.
2. Move creative-heavy workloads as StatefulSets if local cache or warm assets matter.
3. Keep Railway only for low-throughput control-plane services during the transition.

## MENA Market Configuration

- Tenant market preferences are defined through `tenant.settings.marketPreferences`.
- Creative requests may include `market` fields for per-request overrides.
- Shared localization helpers live in `packages/shared/src/utils/mena.ts`.

Recommended tenant defaults for MENA-focused customers:

- `language=ar`
- `direction=rtl`
- `dialect=auto`
- `countryCode` set to the primary operating market such as `AE`, `SA`, or `EG`

## Validation Commands

Use these during CI or release verification. The full release gate is documented in [release-readiness.md](release-readiness.md).

```powershell
corepack pnpm --filter @nexuszero/shared build
corepack pnpm exec vitest run packages/db/src/client.test.ts packages/queue/src/kafka-client.test.ts packages/queue/src/producers.test.ts packages/shared/src/utils/mena.test.ts apps/api-gateway/tests/tenant-isolation.test.ts apps/api-gateway/tests/intelligence-summary.test.ts apps/api-gateway/tests/gateway.test.ts apps/api-gateway/tests/assistant-language.test.ts apps/api-gateway/tests/assistant-chat.test.ts apps/onboarding-service/src/worker.test.ts apps/orchestrator/src/task-router.test.ts apps/orchestrator/tests/index.test.ts apps/webhook-service/tests/index.test.ts apps/compatibility-agent/tests/index.test.ts apps/agents/seo-agent/src/llm.test.ts
corepack pnpm --filter @nexuszero/db build
corepack pnpm --filter @nexuszero/queue build
corepack pnpm --filter @nexuszero/api-gateway build
corepack pnpm --filter @nexuszero/onboarding-service build
corepack pnpm --filter @nexuszero/orchestrator build
corepack pnpm --filter @nexuszero/webhook-service build
corepack pnpm --filter @nexuszero/compatibility-agent build
corepack pnpm --filter @nexuszero/seo-agent build
corepack pnpm --filter @nexuszero/ad-agent build
```