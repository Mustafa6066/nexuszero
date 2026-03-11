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
pnpm --filter @nexuszero/dashboard dev
```

## Project Structure

```
nexuszero/
├── apps/
│   ├── api-gateway/          # REST + GraphQL API (Hono, port 4000)
│   ├── orchestrator/         # Task graph, scheduler, signal router (port 4001)
│   ├── webhook-service/      # Webhook fan-out and delivery (port 4003)
│   ├── onboarding-service/   # Tenant onboarding state machine (port 4004)
│   ├── dashboard/            # Next.js 14 web app (Vercel, port 3000)
│   └── agents/
│       ├── seo-agent/        # SEO optimization agent
│       ├── ad-agent/         # Ad management + creative generation agent
│       ├── data-nexus/       # Analytics and data intelligence agent
│       └── aeo-agent/        # Answer engine optimization agent
├── packages/
│   ├── shared/               # Types, schemas, utils, constants
│   ├── queue/                # BullMQ + Kafka client abstraction
│   └── db/                   # Drizzle ORM, schemas, migrations
├── docs/                     # Documentation
├── scripts/                  # Setup and utility scripts
├── docker-compose.yml        # Local infrastructure
└── turbo.json                # Turborepo pipeline config
```

## Common Tasks

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
6. Add Kafka signal types in `packages/queue/src/events.ts`
7. Register routes in orchestrator signal consumer
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
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | Secret for JWT signing (min 32 chars) |
| `ENCRYPTION_KEY` | ✅ | AES-256 encryption key (64 hex chars) |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic Claude API key |
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `KAFKA_URL` | ✅ | Upstash Kafka REST URL |
| `KAFKA_USERNAME` |  ✅ | Upstash Kafka username |
| `KAFKA_PASSWORD` | ✅ | Upstash Kafka password |
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

Or use the GitHub Actions CI pipeline which auto-deploys on push to `main`.

### Vercel (Dashboard)

The dashboard deploys automatically via Vercel Git integration. Configuration is in `apps/dashboard/vercel.json`.

Manual deploy:
```bash
cd apps/dashboard
vercel --prod
```
