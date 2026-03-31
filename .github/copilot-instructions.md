# NexusZero — Project Guidelines

## Architecture

Multi-tenant SaaS orchestrating autonomous AI agent swarms. Key layers:

- **Dashboard** — Next.js 14 (Vercel), TanStack Query + Zustand
- **API Gateway** — Hono + GraphQL Yoga (REST + GraphQL + WebSocket)
- **Orchestrator** — Task DAG execution, cron, inter-agent signal routing
- **Agents** — BullMQ workers (SEO, Ad, Data Nexus, AEO, Creative, Reddit, Social, GEO, Compatibility)
- **Webhook / Onboarding Services** — Event fan-out, 12-state tenant provisioning FSM

Communication: REST/GraphQL at edges → BullMQ for task dispatch → Upstash Kafka for inter-agent signals.

See [docs/architecture.md](docs/architecture.md) for system design deep-dive, [docs/api-reference.md](docs/api-reference.md) for endpoints, [docs/onboarding-flow.md](docs/onboarding-flow.md) for tenant provisioning FSM.

## Build and Test

```bash
pnpm install                    # Install all workspace dependencies
pnpm dev                        # Start all services (turbo)
pnpm build                      # Build all packages (topological)
pnpm test                       # Run all vitest suites
pnpm test:e2e                   # End-to-end tests (requires build)
pnpm db:generate                # Generate Drizzle migration from schema changes
pnpm db:migrate                 # Apply migrations
pnpm db:seed                    # Seed local database
```

Local infra via `docker-compose up -d` — provisions PostgreSQL 16 (pgvector), Redis 7, ClickHouse, MinIO, Playwright.

See [docs/developer-guide.md](docs/developer-guide.md) for setup walkthrough and env var reference.

## Code Style

- **TypeScript strict mode**, ES2022 target, ESM-only (`"type": "module"`)
- **Files**: `kebab-case.ts` — schemas: `{domain}.schema.ts`
- **Exports**: PascalCase classes/types, camelCase functions, SCREAMING_SNAKE constants
- **Imports**: Use `@nexuszero/*` workspace aliases — never relative paths across packages. Subpath imports (e.g., `@nexuszero/db/clickhouse-client`) must be declared in the producer package's `exports` field
- **Barrel exports**: Each package exposes `src/index.ts` re-exporting types, constants, utils, schemas

## Conventions

### Multi-Tenancy (critical)

Every database table has a `tenant_id` column. Every query must be scoped:

- Wrap DB access in `withTenantDb(tenantId, callback)` — sets RLS context automatically
- BullMQ queues are tenant-scoped: `{agent-type}-tasks:{tenant_id}`
- Kafka topics: `events.{tenant_id}.signal`
- Never query without tenant context — `DB_ENFORCE_RLS=true` will reject unscoped queries

### Agent implementation

Standard agent structure under `apps/agents/{name}/src/`:

```
index.ts        # Entry: discover tenants, start workers
worker.ts       # Extends BaseAgentWorker, routes tasks by type
llm.ts          # LLM function definitions (Claude/OpenAI via @nexuszero/llm-router)
handlers/       # One file per task type (e.g., seo-audit.ts)
```

Agents extend `BaseAgentWorker` from `@nexuszero/queue`. Use `publishAgentSignal()` for inter-agent events. See any existing agent (e.g., `apps/agents/seo-agent/`) as reference.

### Error handling

Use `AppError` from `@nexuszero/shared` with structured error codes (Auth: 1xxx, Tenant: 2xxx, Agent: 3xxx, etc.). Never throw plain `Error` in request handlers.

### Logging

Use `createLogger(serviceName)` from `@nexuszero/shared`. It outputs structured JSON and propagates tenant/request context via `AsyncLocalStorage`. Never use `console.log` directly.

### Observability

OpenTelemetry is initialized per service via `initializeOpenTelemetry()`. Use `withSpan()` for custom spans. Trace context propagates through Kafka messages via `propagateTraceContext()` / `extractTraceContext()`.

See [docs/enterprise-ops.md](docs/enterprise-ops.md) for observability, RLS enforcement, and Terraform IaC.

### Testing

Vitest with globals enabled, 15s timeout, v8 coverage. Tests go in `tests/` directories alongside source. Use `createTestApp()` pattern for API handler tests — avoid real DB/Redis in unit tests.

### Workspace dependency builds

Cross-package imports use `@nexuszero/*` names from `package.json`, not folder paths. Validate dependency order with: `pnpm turbo run build --filter=@nexuszero/<package>...`
