# NexusZero Architecture

## Overview

NexusZero is a multi-tenant SaaS platform that deploys autonomous AI agent swarms plus a tenant-aware Hybrid Brain control layer to manage marketing, SEO, advertising, creative generation, and customer onboarding for B2B clients.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Vercel (Edge Network)                        │
│                     ┌─────────────────────────┐                     │
│                     │   Next.js Dashboard      │                    │
│                     │   (App Router / RSC)      │                    │
│                     └────────────┬──────────────┘                    │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │ HTTPS
┌──────────────────────────────────┼──────────────────────────────────┐
│                           Railway Cloud                             │
│                                  │                                  │
│        ┌─────────────────────────▼───────────────────────┐          │
│        │              API Gateway (Hono)                  │          │
│        │  REST /api/v1/* · GraphQL /graphql · WebSocket   │          │
│        │  Auth · Tenant Isolation · Rate Limiting         │          │
│        └────────────┬───────────────────┬────────────────┘          │
│                     │                   │                           │
│        ┌────────────▼──────┐   ┌────────▼────────┐                  │
│        │ Orchestrator +    │   │ Webhook Service  │                  │
│        │ Hybrid Brain      │   │ (Fan-out, HMAC)  │                  │
│        └─┬─────┬─────┬────┘   └─────────────────┘                  │
│          │     │     │                                              │
│    ┌─────▼┐ ┌─▼───┐ ├──────┐ ┌──────────┐ ┌──────────┐            │
│    │ SEO  │ │ Ad   │ │Data  │ │  AEO     │ │Onboarding│            │
│    │Agent │ │Agent │ │Nexus │ │ Agent    │ │ Service  │            │
│    └──────┘ └──────┘ └──────┘ └──────────┘ └──────────┘            │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐       │
│  │PostgreSQL│  │  Redis   │  │ClickHouse │  │Cloudflare R2 │       │
│  │ (+ pgvec)│  │ (BullMQ) │  │(Analytics)│  │  (Objects)   │       │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘       │
│                                                                     │
│               ┌─────────────────────────┐                           │
│               │   Upstash Kafka         │                           │
│               │ (Inter-Agent Events)    │                           │
│               └─────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

## Multi-Tenancy

Every request is scoped to a tenant. Isolation is enforced at multiple levels:

| Layer         | Mechanism |
|---------------|-----------|
| API Gateway   | Auth middleware extracts `tenantId` from JWT / API key |
| Database      | PostgreSQL Row-Level Security (RLS) via `SET LOCAL app.current_tenant_id` |
| Queue         | Tenant-scoped BullMQ queues: `{agent-type}-tasks:{tenant_id}` |
| Kafka         | Per-tenant event topics: `events.{tenant_id}` |
| Rate Limiting | Plan-based limits (Launchpad 100/min, Growth 500/min, Enterprise 2000/min) |

### Tenant Context Propagation

```
Request → authMiddleware (extract user + tenantId)
       → tenantMiddleware (verify tenant exists, set context)
       → AsyncLocalStorage via runWithTenantContext()
       → withTenantDb() sets RLS variable before every query
```

## Agent Architecture

All agents follow a consistent structure:

```
agent/
├── src/
│   ├── index.ts          # BullMQ worker entry point
│   ├── worker.ts         # Task router (switch on taskType → handler)
│   ├── llm.ts            # LLM function definitions
│   └── handlers/
│       ├── handler-a.ts  # Individual task handler
│       └── handler-b.ts
```

### Agent Types

| Agent | Queue | Task Types |
|-------|-------|------------|
| SEO Agent | `seo-tasks:{tid}` | keyword_research, content_optimization, technical_audit, backlink_analysis, rank_tracking |
| Ad Agent | `ad-tasks:{tid}` | campaign_optimization, bid_management, audience_analysis, budget_allocation, performance_report |
| Data Nexus | `data-tasks:{tid}` | funnel_analysis, anomaly_detection, forecasting, cross_channel_attribution, executive_summary |
| AEO Agent | `aeo-tasks:{tid}` | citation_scan, entity_optimization, visibility_tracking, answer_optimization |
| Creative | `creative-tasks:{tid}` | generate_creative, ab_test, brand_check |

The active fleet also includes compatibility, content-writer, social, reddit, outbound, sales-pipeline, finance, podcast, and geo-focused workers.

### Inter-Agent Communication

Agents communicate through Kafka signals:
1. Agent completes a task and produces a signal (e.g., `seo.keyword_discovered`)
2. Orchestrator consumes the signal and forwards it to both the task router and the embedded Hybrid Brain
3. The Hybrid Brain updates the tenant operating picture, scores follow-up opportunities, and can generate missions, task DAGs, or reactions
4. Target agents receive new tasks in their tenant-scoped BullMQ queues

## Data Layer

### PostgreSQL (Primary)

- **Drizzle ORM** with 18+ tables across 14 schema files
- **pgvector** extension for embedding-based similarity search
- **RLS** for tenant isolation — every table has `tenant_id` column
- Key tables: tenants, users, campaigns, agent_tasks, creatives, webhooks, api_keys

### ClickHouse (Analytics)

- 3 tables: `marketing_events`, `metric_snapshots`, `anomaly_log`
- Ingestion via Kafka consumer in Data Nexus agent
- Used for time-series analytics, funnel analysis, anomaly detection

### Redis

- **BullMQ** job queues and scheduling
- **Rate limiting** (sliding window per tenant)
- **Agent heartbeats** and health monitoring
- **Task graph state** for orchestrator DAG execution
- **Brain control-plane state** including missions, reaction logs, rollback plans, strategy decisions, and temporary operating context caches

### Cloudflare R2

- S3-compatible object storage
- Stores generated creative assets (images, documents)
- Accessed via `@aws-sdk/client-s3` with R2 endpoint

## Authentication

### JWT Flow
1. User calls `POST /api/v1/auth/login` with email + password
2. API Gateway verifies credentials, returns signed JWT
3. Subsequent requests include `Authorization: Bearer {token}`

### API Key Flow
1. Tenant admin creates API key via `POST /api/v1/tenants/{id}/api-keys`
2. Key is SHA-256 hashed before storage; raw key returned once
3. Requests include `X-API-Key: nzk_{key}` header

## Hybrid Brain

The Hybrid Brain lives in `packages/brain` and runs as an embedded control-plane package inside the orchestrator process.

- **Perception layer**: aggregates Kafka signals, fleet heartbeats, queue depth, integrations, and recent outcomes into a tenant operating picture
- **Reasoning layer**: scores opportunities, evaluates strategy drift, and computes blast radius for proposed actions
- **Planning layer**: generates dynamic task DAGs and rollback plans instead of dispatching isolated one-off tasks
- **Reaction layer**: handles failures, anomalies, budget thresholds, and agent degradation through configurable reactions and escalations
- **Mission layer**: tracks multi-step work as missions spanning several tasks and agents
- **Intelligence services**: maintains signal graphs, temporal hotspots, prediction hints, cost intelligence, stale strategy detection, and expertise maps
- **Prompt/context assembly**: builds 4-layer prompts so downstream agents receive tenant context and historical outcome patterns

See [hybrid-brain.md](hybrid-brain.md) for the package layout, control-loop phases, mission lifecycle, storage boundaries, rollout guidance, and validation workflow.

## Orchestrator

The orchestrator is now the execution control plane for both routing and reasoning:

- **Task Graph**: DAG-based execution with dependency resolution
- **Embedded Brain Loop**: tenant-scoped perceive -> reason -> plan -> react cycle sourced from `@nexuszero/brain`
- **Mission Lifecycle**: multi-step work tracked as higher-order missions instead of only independent tasks
- **Priority Queue**: Critical > High > Medium > Low
- **Scheduler**: 6 cron jobs (hourly rank checks, daily reports, etc.)
- **Signal Router**: Consumes Kafka signals and dispatches follow-up tasks
- **Reaction Engine**: diagnose/retry, investigate/adjust, strategy proposal, throttling, and load redistribution paths
- **Rollout Controls**: scheduled brain ticks are allowlisted via orchestrator env vars such as `BRAIN_TENANT_IDS`

## Webhook Service

- Event pattern matching with wildcard support (`agent.*`, `campaign.created`)
- HMAC-SHA256 signed payloads for verification
- Exponential backoff with jitter (max 5 retries)
- Delivery tracking with success/failure counts

## Onboarding Service

12-state machine for tenant onboarding:

```
init → validating → provisioning_db → creating_tenant → configuring_agents →
initial_audit → generating_creatives → setting_up_webhooks → demo_campaign →
final_review → activating → completed
```

Auto-advances through states when steps complete successfully. Failed steps can be retried.

## Dashboard (Next.js)

- **App Router** with server components and client interactivity
- **8 pages**: Overview, Campaigns, Agents, Analytics, Creatives, AEO, Webhooks, Settings
- **Auth**: NextAuth with CredentialsProvider, JWT strategy
- **State**: Zustand (client) + TanStack Query (server)
- **Charts**: Recharts with custom dark-themed wrappers
