# NexusZero

NexusZero is a multi-tenant AI operations platform for growth, marketing, sales, revenue, and customer-facing teams.

It connects a company's website, analytics, ad platforms, CRM, CMS, messaging tools, and financial systems, then coordinates specialized AI agents to find opportunities, execute work, monitor outcomes, and keep the whole operation visible from one shared control layer.

## What The Platform Does

- Scans a business's website and marketing stack to establish a readiness baseline.
- Connects tools such as analytics, ads, CRM, CMS, messaging, and finance systems.
- Routes work to specialized AI agents for SEO, ads, content, AEO, sales pipeline, outbound, finance, podcast, social, local SEO, and data analysis.
- Coordinates tasks across agents so one result can trigger the next best action automatically.
- Scores experiments, monitors pacing, detects anomalies, and produces executive-ready summaries.
- Gives managers and customers a clear view of what is happening, what changed, and what should happen next.

## Who It Is For

| Audience | What they get from NexusZero |
|---|---|
| Marketing leaders | A single operating layer across SEO, paid media, content, and reporting |
| Revenue and sales teams | Lead scoring, outbound support, pipeline intelligence, and deal recovery |
| Agency and service teams | A multi-tenant way to run repeatable client operations with isolation built in |
| Executives and customers | Plain-language visibility into performance, risks, and next actions |

## How It Works

1. A tenant enters goals, website, and priority channels.
2. NexusZero scans the site, detects stack signals, and opens a guided onboarding flow.
3. The compatibility layer connects external systems and keeps those connections healthy.
4. The orchestrator breaks work into tasks and sends each task to the right specialized agent.
5. Agents complete work, publish signals, and trigger follow-up tasks in other agents when useful.
6. The dashboard and API expose outputs, approvals, alerts, scorecards, and reports.

## Agent And Service Map

| Component | Role |
|---|---|
| Compatibility Agent | Detects tools, manages OAuth and connector health, handles schema drift and self-healing |
| SEO Agent | Keyword discovery, content briefs, GSC optimization, trend scouting, technical SEO |
| Ad Agent | Budget allocation, bid optimization, spend monitoring, CRO audits, lead magnet support |
| Creative Capabilities | Image, copy, and landing-page style generation tied to campaign workflows |
| Data Nexus | Attribution, forecasting, experiments, pacing alerts, weekly scorecards, client reporting |
| AEO Agent | AI-search visibility, citations, entity optimization, answer engine performance |
| Content Writer Agent | Long-form writing, expert review, editorial planning, transformations, deck generation |
| Sales Pipeline Agent | ICP modeling, lead scoring, call analysis, deal resurrection, pricing pattern guidance |
| Outbound Agent | Cold outbound design, lead verification, competitor monitoring, warmup planning |
| Finance Agent | CFO briefings, cost estimates, scenario modeling, anomaly review |
| Podcast Agent | Episode ingestion, content atom extraction, repurposing, viral scoring, calendar building |
| Social Agent | Social listening, YouTube competitive analysis, engagement support |
| Reddit Agent | Brand mention monitoring, reply drafting, community engagement support |
| GEO Agent | Local SEO, citation auditing, location-aware search visibility |
| Orchestrator | Task planning, scheduling, dependency resolution, signal routing |
| API Gateway | Secure entry point for dashboard, REST, GraphQL, auth, tenant scoping |
| Onboarding Service | Guides new tenants from scan to live workspace |
| Webhook Service | Sends signed events to external systems and tracks delivery |

## Under The Hood

| Layer | What it does |
|---|---|
| Dashboard | The interface managers and customers use to review work and outcomes |
| API Gateway | The secure front door that validates identity, tenant scope, and request limits |
| PostgreSQL + RLS | Stores tenant data with row-level isolation so one customer cannot see another |
| Redis + BullMQ | Holds queued work and scheduled jobs |
| Upstash Kafka | Passes signals between agents so work can chain automatically |
| ClickHouse | Stores large-scale analytics and performance history |
| Orchestrator | Decides what should happen next and which agent should do it |

## Key Platform Capabilities

- Multi-tenant isolation with tenant-scoped queues, topics, and database access.
- Reactive agent-to-agent coordination through signal publishing and subscription routing.
- Guided onboarding with stack detection, baseline scoring, and integration planning.
- Experiment scoring, weekly scorecards, pacing alerts, and revenue attribution.
- Executive-ready summaries for customers, managers, and finance stakeholders.
- Webhook fan-out for external systems and automation hand-offs.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker and Docker Compose

### Setup

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Common workspace commands:

| Command | Description |
|---|---|
| `pnpm dev` | Start the full local stack |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run Vitest suites across the workspace |
| `pnpm test:e2e` | Run end-to-end tests |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:seed` | Seed local data |

## Project Structure

```text
nexuszero/
├── apps/
│   ├── api-gateway/
│   ├── compatibility-agent/
│   ├── dashboard/
│   ├── onboarding-service/
│   ├── orchestrator/
│   ├── webhook-service/
│   └── agents/
│       ├── ad-agent/
│       ├── aeo-agent/
│       ├── content-writer-agent/
│       ├── data-nexus/
│       ├── finance-agent/
│       ├── geo-agent/
│       ├── outbound-agent/
│       ├── podcast-agent/
│       ├── reddit-agent/
│       ├── sales-pipeline-agent/
│       ├── seo-agent/
│       └── social-agent/
├── packages/
│   ├── db/
│   ├── eval/
│   ├── llm-router/
│   ├── queue/
│   ├── renderer/
│   └── shared/
├── docs/
├── docker-compose.yml
├── turbo.json
└── package.json
```

## Documentation

- [docs/platform-capabilities-guide.md](docs/platform-capabilities-guide.md) - Plain-English guide for managers and customers, including scenarios and backend flow.
- [docs/architecture.md](docs/architecture.md) - Technical architecture, data flow, and multi-tenancy model.
- [docs/hybrid-brain.md](docs/hybrid-brain.md) - Deep dive into the embedded Brain control loop, state model, rollout, and validation workflow.
- [docs/api-reference.md](docs/api-reference.md) - REST and GraphQL endpoint reference.
- [docs/developer-guide.md](docs/developer-guide.md) - Local setup, workflows, and engineering guidance.
- [docs/onboarding-flow.md](docs/onboarding-flow.md) - Product onboarding journey and state transitions.
- [docs/enterprise-ops.md](docs/enterprise-ops.md) - Observability, deployment, and runtime guidance.

## License

Proprietary. All rights reserved.
