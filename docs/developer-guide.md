# NexusZero — Developer Guide

## Prerequisites

- **Node.js** ≥ 20.x
- **pnpm** ≥ 9.1.0
- **Docker** & Docker Compose (for local infrastructure)
- **Git**

## Getting Started

### 1. Clone and Install

```bash
git clone <repo-url> nexuszero && cd nexuszero
pnpm install
```

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values. See `.env.example` for all variables with descriptions.

### 3. Start Infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, ClickHouse, and MinIO (S3-compatible storage).

### 4. Setup Database

```bash
# Push schema to database
pnpm --filter @nexuszero/db db:push

# Seed initial data
pnpm --filter @nexuszero/db db:seed
```

### 5. Start Development

```bash
# Start all services in development mode
pnpm dev

# Or start individual services
pnpm --filter @nexuszero/api-gateway dev
pnpm --filter @nexuszero/orchestrator dev
pnpm --filter @nexuszero/brain dev
pnpm --filter @nexuszero/dashboard dev
```

## Project Structure

```
nexuszero/
├── apps/
│   ├── api-gateway/          # REST + GraphQL API (Hono, port 4000)
│   ├── orchestrator/         # Task graph, scheduler, signal router, embedded Brain loop (port 4001)
│   ├── webhook-service/      # Webhook fan-out and delivery (port 4003)
│   ├── onboarding-service/   # Tenant onboarding state machine (port 4004)
│   ├── dashboard/            # Next.js 14 web app (Vercel, port 3000)
│   └── agents/
│       ├── seo-agent/        # SEO optimization agent
│       ├── ad-agent/         # Ad management + creative generation agent
│       ├── data-nexus/       # Analytics and data intelligence agent
│       └── aeo-agent/        # Answer engine optimization agent
├── packages/
│   ├── brain/                # Hybrid Brain reasoning, planning, reactions, missions
│   ├── shared/               # Types, schemas, utils, constants
│   ├── queue/                # BullMQ + Kafka client abstraction
│   ├── llm-router/           # Model routing, usage tracking, budget helpers
│   └── db/                   # Drizzle ORM, schemas, migrations
├── docs/                     # Documentation
├── scripts/                  # Setup and utility scripts
├── docker-compose.yml        # Local infrastructure
└── turbo.json                # Turborepo pipeline config
```

## Common Tasks

For the enterprise validation and release gate commands, see [release-readiness.md](release-readiness.md).

### Running Tests

```bash
# Run all tests
pnpm turbo test

# Run tests for a specific package
pnpm --filter @nexuszero/shared test

# Run with coverage
pnpm --filter @nexuszero/shared test -- --coverage
```

### Type Checking

```bash
pnpm turbo typecheck
```

### Linting

```bash
pnpm turbo lint
```

### Building

```bash
# Build all packages and apps
pnpm turbo build

# Build a specific app
pnpm --filter @nexuszero/api-gateway build

# Build the Hybrid Brain package
pnpm --filter @nexuszero/brain build
```

## Hybrid Brain Development

`@nexuszero/brain` is an internal package consumed by the orchestrator rather than a standalone service.

Use [hybrid-brain.md](hybrid-brain.md) for the full control-loop and state-model deep dive.

Key areas:

- `src/brain-loop.ts` - main perceive -> reason -> plan -> react loop
- `src/perception/` - signal aggregation, fleet state, tenant context assembly
- `src/reasoning/` - opportunity scoring, blast radius analysis, strategy evaluation
- `src/planning/` - dynamic DAG creation and rollback planning
- `src/intelligence/` - signal graph, temporal analysis, prediction, cost, stale detection, expertise mapping
- `src/reactions/` - configurable reaction engine and escalation handlers
- `src/missions/` - mission lifecycle FSM
- `src/context/` - 4-layer prompt assembly for downstream agents

Useful commands:

```bash
pnpm --filter @nexuszero/brain typecheck
pnpm --filter @nexuszero/brain test
pnpm --filter @nexuszero/brain build
pnpm --filter @nexuszero/brain dev
```

### Enterprise Validation

Use the targeted release gate when you need to validate tenant isolation, observability propagation, MENA prompt behavior, and service bootstrap/runtime paths before a deploy:

```bash
corepack pnpm --filter @nexuszero/shared build
corepack pnpm exec vitest run packages/db/src/client.test.ts packages/queue/src/kafka-client.test.ts packages/queue/src/producers.test.ts packages/shared/src/utils/mena.test.ts apps/api-gateway/tests/tenant-isolation.test.ts apps/api-gateway/tests/intelligence-summary.test.ts apps/api-gateway/tests/gateway.test.ts apps/api-gateway/tests/assistant-language.test.ts apps/api-gateway/tests/assistant-chat.test.ts apps/onboarding-service/src/worker.test.ts apps/orchestrator/src/task-router.test.ts apps/orchestrator/tests/index.test.ts apps/webhook-service/tests/index.test.ts apps/compatibility-agent/tests/index.test.ts apps/agents/seo-agent/src/llm.test.ts
corepack pnpm --filter @nexuszero/brain typecheck
corepack pnpm --filter @nexuszero/brain test
```

### Database Operations

```bash
# Generate migration
pnpm --filter @nexuszero/db db:generate

# Push schema changes
pnpm --filter @nexuszero/db db:push

# Open Drizzle Studio
pnpm --filter @nexuszero/db db:studio
```

## Adding a New Agent

1. Create directory: `apps/agents/{agent-name}/`
2. Add `package.json` with dependencies on `@nexuszero/shared`, `@nexuszero/queue`, `@nexuszero/db`
3. Create files:
   - `src/index.ts` — BullMQ worker entry point
   - `src/worker.ts` — Task router
   - `src/llm.ts` — LLM function definitions
   - `src/handlers/` — Individual task handlers
4. Register the agent type in `packages/shared/src/types/agent.ts`
5. Add queue name in `packages/shared/src/constants/event-types.ts`
6. Add typed signal schemas in `packages/queue/src/signal-schemas.ts`
7. Register any new signal subscriptions in `AGENT_SIGNAL_SUBSCRIPTIONS` and update orchestrator or Brain routing if the agent participates in cross-agent workflows
8. Add `railway.toml` for deployment

## Adding a New API Route

1. Create route file in `apps/api-gateway/src/routes/{resource}.ts`
2. Define Zod schemas in `packages/shared/src/schemas/{resource}.schema.ts`
3. Register route in `apps/api-gateway/src/index.ts`
4. Add GraphQL types in `apps/api-gateway/src/graphql/types/{resource}.ts`

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string used locally and in non-private deployments |
| `REDIS_PRIVATE_URL` |  | Preferred internal Redis connection string for Railway service-to-service traffic |
| `JWT_SECRET` | ✅ | Secret for JWT signing (min 32 chars) |
| `ENCRYPTION_KEY` | ✅ | AES-256 encryption key (64 hex chars) |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic Claude API key |
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `KAFKA_URL` | ✅ | Upstash Kafka REST URL |
| `KAFKA_USERNAME` |  ✅ | Upstash Kafka username |
| `KAFKA_PASSWORD` | ✅ | Upstash Kafka password |
| `KAFKA_POLL_INTERVAL_MS` |  | Orchestrator Kafka poll interval override |
| `ORCHESTRATOR_INSTANCE_ID` |  | Stable consumer instance label for orchestrator polling |
| `BRAIN_ENABLED` |  | Gates scheduled Brain loop startup in orchestrator when set to `false` |
| `BRAIN_TENANT_IDS` |  | Comma-separated tenant IDs to include in scheduled Brain ticks |
| `CLICKHOUSE_URL` | ✅ | ClickHouse connection URL |
| `CLICKHOUSE_USER` |  | ClickHouse username (default: `default`) |
| `CLICKHOUSE_PASSWORD` |  | ClickHouse password |
| `R2_ACCOUNT_ID` |  | Cloudflare R2 account ID |
| `R2_ACCESS_KEY` |  | R2 access key |
| `R2_SECRET_KEY` |  | R2 secret key |
| `R2_BUCKET_NAME` |  | R2 bucket name (default: `nexuszero-assets`) |
| `CORS_ORIGIN` |  | Allowed CORS origins, comma-separated |
| `NEXTAUTH_SECRET` | ✅ | NextAuth session secret |
| `NEXTAUTH_URL` |  | Dashboard URL (default: `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` |  | API Gateway URL for dashboard |

## Deployment

### Railway (Backend Services)

Each backend service has a `railway.toml` in its directory. Deploy via:

```bash
railway up --service api-gateway
railway up --service orchestrator
# ... etc
```

For Redis-backed services on Railway, set `REDIS_PRIVATE_URL` or `REDIS_URL` on each service that uses BullMQ or Redis directly. If neither is set, production services now refuse the `localhost:6379` fallback and will report Redis as misconfigured.

Or use the GitHub Actions CI pipeline which auto-deploys on push to `main`.

### Vercel (Dashboard)

The dashboard deploys automatically via Vercel Git integration. Configuration is in `apps/dashboard/vercel.json`.

Manual deploy:
```bash
cd apps/dashboard
vercel --prod
```
