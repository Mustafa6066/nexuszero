# NexusZero

**Enterprise-grade multi-tenant SaaS platform that deploys autonomous AI agent swarms to manage marketing, SEO, advertising, creative generation, and customer onboarding for B2B clients.**

[![CI](https://github.com/your-org/nexuszero/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/nexuszero/actions/workflows/ci.yml)

---

## What is NexusZero?

NexusZero orchestrates five specialized AI agents that work together to run complete marketing operations:

| Agent | Purpose |
|-------|---------|
| **SEO Agent** | Keyword research, content optimization, technical audits, rank tracking |
| **Ad Agent** | Campaign optimization, bid management, budget allocation, performance reporting |
| **Data Nexus** | Funnel analysis, anomaly detection, forecasting, cross-channel attribution |
| **AEO Agent** | Answer engine optimization — track and improve visibility in ChatGPT, Gemini, Perplexity |
| **Creative Engine** | AI-generated ad copy, images (DALL-E 3), landing pages with brand-score validation |

Agents communicate through Kafka signals and coordinate via a DAG-based orchestrator to deliver cohesive marketing execution without human intervention.

## Architecture

```
 Vercel                          Railway
┌──────────────┐    ┌─────────────────────────────────────┐
│  Dashboard   │───▶│  API Gateway (Hono + GraphQL Yoga)  │
│  (Next.js)   │    │         ↓            ↓              │
└──────────────┘    │   Orchestrator   Webhook Service    │
                    │     ↓  ↓  ↓  ↓                      │
                    │  SEO  Ad  Data  AEO  Onboarding     │
                    │         Agents                       │
                    ├─────────────────────────────────────┤
                    │  PostgreSQL · Redis · ClickHouse     │
                    │  Upstash Kafka · Cloudflare R2       │
                    └─────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Hono.js, GraphQL Yoga, Pothos |
| Database | PostgreSQL 16 + pgvector, Drizzle ORM, Row-Level Security |
| Queue | BullMQ (Redis), Upstash Kafka |
| Analytics | ClickHouse Cloud |
| Storage | Cloudflare R2 (S3-compatible) |
| AI / LLM | Anthropic Claude, OpenAI GPT-4 + DALL-E 3 |
| Dashboard | Next.js 14, Tailwind CSS, Recharts, TanStack Query, Zustand |
| Auth | JWT + API Key, NextAuth |
| CI/CD | GitHub Actions → Railway + Vercel |
| Monorepo | Turborepo + pnpm workspaces |
| Testing | Vitest with v8 coverage |

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9.1
- Docker & Docker Compose

### Setup

```bash
# Clone
git clone <repo-url> nexuszero && cd nexuszero

# Install
pnpm install

# Configure
cp .env.example .env
# Edit .env with your API keys and secrets

# Start infrastructure
docker compose up -d

# Setup database
pnpm --filter @nexuszero/db db:push
pnpm --filter @nexuszero/db db:seed

# Start all services
pnpm dev
```

The dashboard will be available at `http://localhost:3000` and the API at `http://localhost:4000`.

## Project Structure

```
nexuszero/
├── apps/
│   ├── api-gateway/          # REST + GraphQL API (port 4000)
│   ├── orchestrator/         # Task DAG, scheduler, signal router (port 4001)
│   ├── webhook-service/      # Event fan-out with HMAC signing (port 4003)
│   ├── onboarding-service/   # 12-state tenant onboarding (port 4004)
│   ├── dashboard/            # Next.js 14 web application
│   └── agents/
│       ├── seo-agent/        # SEO optimization
│       ├── ad-agent/         # Ad management + creative generation
│       ├── data-nexus/       # Analytics intelligence
│       └── aeo-agent/        # Answer engine optimization
├── packages/
│   ├── shared/               # Types, schemas (Zod), utils, constants
│   ├── queue/                # BullMQ + Kafka abstraction
│   └── db/                   # Drizzle ORM schemas + migrations
├── docs/
│   ├── architecture.md       # System architecture deep-dive
│   ├── api-reference.md      # Full REST & GraphQL API docs
│   └── developer-guide.md    # Development setup & workflows
├── docker-compose.yml        # Local PostgreSQL, Redis, ClickHouse, MinIO
├── .github/workflows/ci.yml  # CI/CD pipeline
└── turbo.json                # Monorepo build pipeline
```

## Key Features

### Multi-Tenancy
- Row-Level Security at the database level
- Tenant-scoped job queues and Kafka topics
- Plan-based rate limiting (100 / 500 / 2,000 req/min)
- Complete data isolation

### Autonomous Agent Swarms
- DAG-based task orchestration with dependency resolution
- Inter-agent Kafka signal bus for reactive coordination
- Circuit breakers and exponential retry on all LLM calls
- Per-agent heartbeat monitoring

### Dashboard
- Real-time campaign monitoring with auto-refreshing queries
- Agent control panel (pause / resume / restart)
- Creative gallery with AI generation
- AEO visibility tracking across AI platforms
- Webhook management with delivery monitoring

### Webhook System
- Pattern-based event subscriptions with wildcard support
- HMAC-SHA256 signed payloads
- Exponential backoff with jitter (up to 5 retries)
- Full delivery audit trail

### Security
- AES-256-GCM encryption for sensitive data at rest
- SSRF-protected webhook URL validation
- Input sanitization on all user-facing fields
- Plan-aware rate limiting with Redis sliding window

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all services in development mode |
| `pnpm turbo build` | Build all packages and apps |
| `pnpm turbo test` | Run all test suites |
| `pnpm turbo typecheck` | TypeScript type checking |
| `pnpm turbo lint` | ESLint across all packages |
| `pnpm --filter @nexuszero/db db:push` | Push schema to database |
| `pnpm --filter @nexuszero/db db:studio` | Open Drizzle Studio |
| `docker compose up -d` | Start local infrastructure |

## Deployment

**Backend (Railway):** Each service has a `railway.toml`. The CI pipeline deploys all 8 services on push to `main` via Railway CLI.

**Dashboard (Vercel):** Configured via `apps/dashboard/vercel.json`. Auto-deploys on push via Vercel Git integration.

See [docs/developer-guide.md](docs/developer-guide.md) for detailed deployment instructions.

## Documentation

- [Architecture](docs/architecture.md) — System design, data flow, multi-tenancy
- [API Reference](docs/api-reference.md) — REST + GraphQL endpoint documentation
- [Developer Guide](docs/developer-guide.md) — Setup, workflows, adding new agents

## License

Proprietary. All rights reserved.
