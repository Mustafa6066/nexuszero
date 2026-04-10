# NexusZero Platform Guide For Managers And Customers

This is the detailed manager/customer edition.

It explains five things for every major feature:

- What the user clicks
- What the user sees
- What AI decides behind the scenes
- What backend services execute behind the scenes
- What business outcomes change because of those actions

## In One Sentence

NexusZero is an AI-powered operating system for growth that turns business goals into coordinated agent work, governed automation, and measurable outcomes inside each customer's isolated workspace.

## Who This Guide Is For

| Reader | What this guide helps with |
|---|---|
| Managers | Operate the platform day-to-day, understand approvals and outcomes, and know which screen to use when |
| Customers | Understand what happens after each click, what outputs to expect, and what value arrives over time |
| Stakeholders | Understand the full operating model without needing engineering language |
| Operations teams | Understand automation behavior, safety controls, and recovery patterns |

## The Plain-English Mental Model

Think of NexusZero as a company made of specialists:

- Dashboard: front desk and command center
- API gateway: secure front door
- Onboarding service: setup manager
- Compatibility layer: integrations specialist
- Orchestrator: operations manager and execution control plane
- Hybrid Brain: strategist that turns signals into priorities, missions, and reactions
- Agent fleet: specialists for SEO, ads, AEO, social, finance, outbound, and more
- Database and analytics stores: memory and evidence
- Queue and event system: internal communication channels

## One Concept That Explains Everything: Tenant Isolation

Every customer works inside an isolated workspace called a tenant.

In plain English, this means:

- one customer cannot see another customer's data
- one customer's jobs do not mix with another customer's jobs
- one customer's connectors, approvals, and webhooks stay in that tenant only
- one customer's automation policy does not affect another tenant

Under the hood, most actions carry tenant context from request start to job execution and storage writes.

## The Magic, Explained Simply

When users say, "it feels like magic," this is what is actually happening:

1. Intent capture: the platform captures the user goal, channel priority, and current stack.
2. Signal gathering: scanner and connectors collect technical and performance signals.
3. Operating picture assembly: the Hybrid Brain turns raw signals into a tenant-specific operating picture.
4. Opportunity scoring: the Brain ranks what to do first by impact, risk, readiness, and blast radius.
5. Mission and task planning: the control plane creates concrete task DAGs and first missions, not generic advice.
6. Governed reactions: safe actions can run automatically, degraded agents or stale strategies can trigger reactions or approvals.
7. Measurement loop: analytics and outcome tracking measure what changed after each action.
8. Continuous learning: the next wave of recommendations uses the latest observed results.

Nothing is mystical. It is structured orchestration, policy controls, and repeatable feedback loops.

## What The Hybrid Brain Adds

The new control layer changes the system from a simple router into a mission-oriented operator.

- It watches the full tenant situation, not just the latest incoming task.
- It groups work into missions so the platform can pursue a goal across several agents and steps.
- It reacts to failure patterns, budget pressure, stale strategy, and degraded agents without waiting for a person to rediscover the issue.
- It gives downstream agents better prompts by combining tenant context, task instructions, and historical outcome patterns.
- It keeps a memory of decisions, costs, hotspots, and expertise so the next recommendation is better than the last one.

## End-To-End Scenario: From Sign Up To Full Feature Activation To Outcomes

This section shows a realistic journey from first account creation to measurable business impact.

### Phase 0: Account Sign Up And Workspace Creation

What the user clicks:

- Open sign-up
- Enter work email and password or SSO
- Verify email
- Click Create Workspace

What the user sees:

- Account created confirmation
- A new workspace shell with setup checklist
- Prompt to start onboarding

What AI does:

- Initializes a default operating profile based on selected industry and goal hints
- Prepares initial recommendation templates so onboarding can respond quickly

What backend does:

- Creates tenant record and default workspace settings
- Creates secure auth/session context for that tenant
- Provisions tenant-scoped queue/topic identifiers used later by agents
- Initializes baseline records for onboarding progress, approvals policy, and feature flags

Why this matters:

- The tenant is now isolated and ready for safe, traceable automation

### Phase 1: Guided Onboarding And Diagnostic Baseline

#### Step 1. Business kickoff inputs

What the user clicks:

- Enter website URL
- Select main business goal
- Select priority channel
- Click Analyze my setup

What the user sees:

- Business-focused setup screen
- Read-only scan messaging and expected duration

What AI does:

- Translates business goal into weighted decision priorities
- Chooses initial agent emphasis (for example, paid media first vs AEO first)

What backend does:

- Validates and normalizes URL
- Starts onboarding scan workflow
- Stores kickoff inputs as tenant configuration

#### Step 2. Live scan and compatibility pass

What the user clicks:

- Wait on scan screen or open scan details

What the user sees:

- Progress by category (analytics, ads, SEO, performance, security, CMS)
- Preliminary detections and confidence hints

What AI does:

- Classifies findings into business-relevant categories
- Calculates readiness score and short opportunity list

What backend does:

- Runs diagnostics for tags, tracking coverage, platform fingerprints, and connectivity clues
- Runs compatibility checks for likely integrations and auth readiness
- Persists findings and summary metrics

#### Step 3. Opportunity snapshot and recommended path

What the user clicks:

- Review readiness summary
- Click Set up my recommended path

What the user sees:

- Readiness score
- Top opportunities
- Highest risk area
- Recommended first mission
- Recommended agents

What AI does:

- Generates a goal-aware action path instead of generic checklist output
- Prioritizes actions with highest expected near-term lift and lowest setup friction

What backend does:

- Saves recommended path and activation order
- Prepares next-step integration plan and minimum viable setup threshold

#### Step 4. Integration connection plan

What the user clicks:

- Connect or Reconnect for each platform
- Continue to strategy review

What the user sees:

- Recommended now vs recommended next
- Connector status (active, pending, error, disconnected)
- Minimum viable setup progress

What AI does:

- Reorders connector priority if required by goal and detected stack
- Flags missing high-signal data sources that limit forecast quality

What backend does:

- Initiates connector auth flows and token exchange
- Runs connector health checks
- Stores connector state, expiry, and sync capability
- Marks data sources as available to downstream agents

#### Step 5. Autonomy mode selection

What the user clicks:

- Select Observe Only, Recommend and Approve, or Autopilot for Safe Actions
- Click Review launch summary

What the user sees:

- Clear behavior definitions for each autonomy mode
- Expected approval volume and speed tradeoff

What AI does:

- Adjusts future plan recommendations to match selected governance mode

What backend does:

- Saves workspace approval policy
- Binds policy to decision thresholds used by agents and orchestrator

#### Step 6. Launch summary and command center activation

What the user clicks:

- Review final setup summary
- Click Launch My Command Center

What the user sees:

- Connected systems list
- Activated agents
- Approval behavior
- First mission reminder

What AI does:

- Generates first mission task bundle and fallback tasks if data is partial

What backend does:

- Advances onboarding state machine into launch phase
- Creates initial scheduled tasks, health monitors, and baseline reports

#### Step 7. Provisioning completes

What the user clicks:

- Watch launch progress

What the user sees:

- Connecting, analyzing, launching phases
- Redirect to live dashboard when done

What AI does:

- Produces initial guidance cards and first priority actions

What backend does:

- Finalizes workspace runtime records
- Activates tenant-scoped workers and subscriptions
- Writes first operational snapshots for dashboard and analytics

### Phase 2: Enabling Every Major Feature

After onboarding, teams usually enable all major capabilities over the first week.

1. Scanner: establish fresh baseline and detect post-launch drift.
2. Integrations: connect or repair missing platforms.
3. Dashboard: monitor health and priorities daily.
4. Agents: verify active specialists and control execution state.
5. Analytics: review KPI trends and forecast movement.
6. Campaigns: create, compare, and optimize campaign portfolio.
7. Creatives: generate channel-ready assets and variants.
8. AEO: run citation and AI-visibility checks.
9. Approvals: process gated recommendations quickly.
10. Webhooks: push events to CRM, chat, and internal automation.
11. Background functions: sales pipeline, outbound, finance, podcast, social intelligence, GEO, team operations.

### Phase 3: Outcomes Over 30/60/90 Days

What users typically observe:

- Day 30: cleaner signal quality, faster campaign setup, fewer blind spots
- Day 60: stronger optimization cadence, better approval throughput, improved CTR/CPA stability
- Day 90: clearer pipeline quality, higher operating confidence, measurable uplift in priority KPIs

Why outcomes improve:

- AI keeps reprioritizing work based on latest evidence
- Backend keeps execution reliable through queues, events, and retries
- Governance keeps risk under control while preserving speed

## Feature-By-Feature Deep Dive

Each section below answers the same question: what exactly happens after each click?

### 1) Onboarding

What the user clicks:

- Start onboarding
- Enter business URL and goal
- Review scan snapshot
- Connect selected platforms
- Pick autonomy mode
- Launch workspace

What the user sees:

- Guided setup, readiness score, connection plan, launch summary

AI actions under the hood:

- Maps goal to recommended activation sequence
- Produces first mission and priority stack
- Estimates confidence based on available signals

Backend actions under the hood:

- Runs multi-step onboarding state machine
- Saves each state transition for recoverability and audit
- Provisions tenant runtime context and activation records

Business outcome:

- Time to first value is reduced because setup is path-based, not form-heavy

### 2) Scanner

What the user clicks:

- Open Scanner
- Enter site URL
- Click Scan Website

What the user sees:

- Readiness score, detections, missing setup items, recommendations

AI actions under the hood:

- Converts technical scan output into business priorities
- Detects likely root causes for performance or attribution gaps

Backend actions under the hood:

- Executes diagnostics across tracking, SEO, performance, security, and CMS signals
- Stores normalized findings so future scans can show change over time

Business outcome:

- Teams get a shared baseline before planning investments

### 3) Integrations

What the user clicks:

- Connect or Reconnect on selected platforms

What the user sees:

- Connector statuses, sync health, and recommendation order

AI actions under the hood:

- Scores connector importance by planned workflows and KPI dependencies
- Detects when missing connectors reduce recommendation quality

Backend actions under the hood:

- Runs connector auth and token lifecycle management
- Tracks connector health, retries, and degradation states
- Makes connected data available to tenant-scoped workflows

Business outcome:

- Fewer fragmented reports and better cross-channel decision quality

### 4) Dashboard Overview

What the user clicks:

- Open Dashboard
- Drill into cards for alerts, opportunities, and tasks

What the user sees:

- Current stage guidance, active risks, top opportunities, and quick links

AI actions under the hood:

- Ranks what deserves attention now
- Generates concise action prompts tied to outcomes

Backend actions under the hood:

- Aggregates latest tenant state from analytics, agent health, approvals, and connectors
- Serves a compact control-room snapshot

Business outcome:

- Managers can decide quickly without searching across tools

### 5) Agents

What the user clicks:

- Open Agents
- View actions, pause, resume, restart, or emergency stop

What the user sees:

- Agent status, task counts, success rate, and recent activity

AI actions under the hood:

- Assigns tasks to best-fit specialists
- Rebalances load when one area becomes priority

Backend actions under the hood:

- Dispatches tenant-scoped jobs via queue workers
- Tracks run status, retries, failures, and completion metrics
- Applies control commands to individual or global execution

Business outcome:

- Higher execution reliability with transparent control over automation pace

### 6) Analytics

What the user clicks:

- Open Analytics
- Select 7d, 30d, or 90d

What the user sees:

- ROAS, CPA, CTR, impressions, revenue trends, funnel health, forecasts

AI actions under the hood:

- Produces composite insights from multiple data sources
- Explains likely causes for movement and likely next actions

Backend actions under the hood:

- Computes metric windows and trend deltas
- Serves tenant-scoped summaries and forecast payloads

Business outcome:

- Better budgeting and faster identification of what is working or failing

### 7) Campaigns

What the user clicks:

- Create, compare, edit, pause, or delete campaigns

What the user sees:

- Campaign cards with status, budget, spend, impressions, and CTR

AI actions under the hood:

- Recommends budget pacing and experiment direction
- Flags underperformers and candidate winners

Backend actions under the hood:

- Stores campaign definitions and change history
- Routes campaign updates to optimization workflows

Business outcome:

- Faster iteration cycles and less budget waste

### 8) Creatives

What the user clicks:

- Generate Creative
- Choose format and direction
- Submit variants

What the user sees:

- Generated assets, status lifecycle, quality indicators, and archive controls

AI actions under the hood:

- Generates variants aligned to format, platform, and brand constraints
- Estimates performance indicators where supported

Backend actions under the hood:

- Runs generation workflow and stores asset metadata and outputs
- Links assets to campaigns and approval state when required

Business outcome:

- More tests per cycle with consistent brand control

### 9) AEO

What the user clicks:

- Open AEO
- Run Citation Scan

What the user sees:

- Citation counts, positive mention rate, visibility score, tracked entities

AI actions under the hood:

- Evaluates brand presence in AI-answer surfaces
- Highlights gaps where entity clarity or citation depth is weak

Backend actions under the hood:

- Ingests mention/citation signals and updates entity visibility records
- Maintains time-based view of visibility movement

Business outcome:

- Stronger discoverability in answer-engine environments

### 10) Approvals

What the user clicks:

- Open approval queue
- Filter by status
- Approve or reject proposed actions
- Update autonomy level if permitted

What the user sees:

- Pending actions with priority, reason, risk context, and agent source

AI actions under the hood:

- Adds rationale for why an action is recommended now
- Applies policy thresholds to decide auto-run vs human-review

Backend actions under the hood:

- Stores queue state transitions (pending, approved, rejected, expired)
- Unblocks or cancels downstream execution based on reviewer decision

Business outcome:

- Fast execution with human control where impact or risk is higher

### 11) Webhooks

What the user clicks:

- Add endpoint
- Configure event patterns
- Add optional signing secret
- Save or delete endpoint

What the user sees:

- Endpoint status, delivery history, failure streaks, and success rate

AI actions under the hood:

- Can recommend event subscriptions based on active workflows
- Can highlight noisy or low-value webhook patterns

Backend actions under the hood:

- Validates endpoint format and security requirements
- Signs payloads and delivers with retry/backoff behavior
- Tracks delivery outcomes for observability and operations

Business outcome:

- Reliable handoff of NexusZero events into CRM, chat, and internal systems

## Deep Agent Internals: Each Agent And How It Works

This section explains every agent deeply, based on the actual runtime pattern in the codebase.

### Shared Runtime Pattern (All Agents)

All agents run on the same core worker architecture with tenant-safe isolation.

How all agents execute under the hood:

1. Startup and tenant discovery.
2. Agent service initializes telemetry and discovers active tenants.
3. Worker subscriptions are created for tenant-scoped queues and a base queue.
4. Job intake and tenant context.
5. Each job is executed inside tenant context so data reads and writes stay isolated.
6. Task lifecycle persistence.
7. Task status and agent heartbeat are written to database and Redis.
8. AI plus handler execution.
9. Handler code loads context, invokes LLM or rule logic, and writes outcomes.
10. Event publication.
11. Task result is published for downstream consumers and analytics.
12. Reliability controls.
13. Retries, circuit breakers, heartbeats, and structured error logging keep the fleet stable.

Important platform-level mechanics all agents share:

- Tenant queue naming uses dot-scoped queues, for example: `seo-tasks.<tenantId>`.
- Worker concurrency is configured per agent type.
- Heartbeats are emitted on interval and reflected in agent status.
- Task traces carry correlation and tracing context through execution.
- Task completion and failure are published for orchestration and observability.

### Agent 1: Compatibility Agent (System Integrator)

Mission:

- Detect stack, connect platforms, keep integrations healthy, recover from breakage, and activate the right agent set.

Queue runtime:

- Queue base: `compatibility-tasks`
- Concurrency: 5
- Heartbeat interval: 15 seconds

How it gets work:

- Onboarding steps
- Integration requests
- OAuth flows
- Health and healing cycles
- Universal onboarding requests for unknown platforms

Task router coverage:

- Discovery: `tech_stack_detection`
- Onboarding: `onboarding_flow`, `tenant_provision`, `agent_activate`
- OAuth and permission recovery: `oauth_connect`, `oauth_refresh`, `permission_recovery`
- Health and rate limits: `health_check`, `rate_limit_check`
- Schema and API checks: `schema_snapshot`, `drift_detection`, `api_version_check`
- Healing: `auto_reconnect`
- Connector proxy calls: `connector_request`
- Strategy generation: `strategy_generate`
- Universal onboarding and platform intelligence: `universal_onboard`, `platform_analyze`, `platform_preview`, `dynamic_connect`, `dynamic_health_check`, `knowledge_search`

AI and intelligence layer:

- Analyzes platform docs/signals to build platform blueprints.
- Supports dynamic connectors for non-native platforms.
- Recommends integration strategy from health and detected stack.

Backend orchestration layer:

- Registers connectors (analytics, ads, CRM, CMS, messaging, payments).
- Exposes internal API endpoints for detect, OAuth, health, and universal onboarding.
- Runs scheduled jobs for token refresh, health sweep, schema refresh, and healing sweep.
- Activates downstream agents based on connected platform coverage.

Why this agent is special:

- It is both a worker and an integration control plane (API plus cron plus worker).

### Agent 2: SEO Agent

Mission:

- Improve search visibility through audits, keyword strategy, technical checks, and content-level optimization.

Queue runtime:

- Queue base: `seo-tasks`
- Concurrency: 5

Task router coverage:

- `seo_audit`
- `keyword_research`
- `content_optimization`
- `technical_seo_check`
- `technical_seo_deep`
- `competitor_analysis`
- `update_seo_strategy`
- `content_attack_brief`
- `gsc_optimization`
- `trend_scouting`

AI layer:

- Uses an Anthropic-backed service with retry and circuit breaker protection.
- Adds market-aware language controls and Arabic/RTL handling when relevant.
- Produces structured JSON outputs for deterministic downstream handling.

Backend behavior:

- Emits SEO signals for downstream consumers.
- Supports deep technical mode when higher diagnostic depth is required.
- Integrates with strategy updates that can influence AEO paths.

### Agent 3: AEO Agent

Mission:

- Improve brand visibility across answer engines through citation scanning, schema/entity optimization, and visibility scoring.

Queue runtime:

- Queue base: `aeo-tasks`
- Concurrency: 5

Task router coverage:

- `scan_citations`
- `aeo_probe`
- `optimize_schema`
- `analyze_visibility`
- `update_seo_strategy`
- `build_entity_graph`

AI layer:

- Citation behavior analysis by platform and query.
- Schema markup generation for entity clarity.
- Visibility scoring with recommendations.

Backend behavior:

- Builds entity graphs for tracked entities.
- Accepts SEO-driven update tasks for cross-agent alignment.
- Emits AEO visibility and citation signals.

### Agent 4: Ad Agent

Mission:

- Optimize paid media performance across bids, campaigns, audiences, creatives, and conversion surfaces.

Queue runtime:

- Queue base: `ad-tasks`
- Concurrency: 5

Task router coverage:

- `optimize_bids`
- `manage_campaign`
- `sync_keywords`
- `analyze_audience`
- `generate_creative`
- `run_ab_test`
- `check_fatigue`
- `cro_audit`
- `survey_lead_magnet`

AI layer:

- Uses Anthropic-based analysis with retry/circuit breaker safeguards.
- Produces structured bid, audience, and creative recommendations.
- Applies market/language-aware creative instruction when generating copy.

Backend behavior:

- Routes each task type to a specialized handler.
- Supports experimentation and fatigue detection loops.
- Emits ad/creative optimization signals for system-wide learning.

### Agent 5: Data Nexus Agent

Mission:

- Convert multi-source data into operational intelligence, forecasts, anomaly alerts, and reporting assets.

Queue runtime:

- Queue base: `data-tasks`
- Concurrency: 5

Task router coverage:

- `daily_analysis`
- `investigate_anomaly`
- `forecast`
- `compound_insights`
- `predict_performance`
- `experiment_create`
- `experiment_score`
- `experiment_playbook`
- `weekly_scorecard`
- `pacing_alert`
- `revenue_attribution`
- `client_report`

AI layer:

- Uses Anthropic-based analytics prompts for narrative and recommendations.
- Supports anomaly root-cause reasoning and forecast interpretation.
- Produces structured outputs for dashboards and reports.

Backend behavior:

- Runs cross-metric analyses and experiment scoring workflows.
- Emits pacing, anomaly, and attribution signals.
- Feeds executive and customer-facing summaries.

### Agent 6: Content Writer Agent

Mission:

- Produce publish-ready content assets across blog, social, email, repurposing, and editorial workflows.

Queue runtime:

- Queue base: `content-tasks`
- Concurrency: 3

Task router coverage:

- `write_blog_post`
- `write_social_copy`
- `write_email`
- `publish_content`
- `expert_panel_review`
- `quality_gate`
- `editorial_brain`
- `quote_mining`
- `content_transform`
- `x_longform_post`
- `generate_deck`

AI layer:

- Uses `@nexuszero/llm-router` presets for long-form, content writing, and fast scoring.
- Can combine prompt inputs with research context for richer outputs.
- Returns JSON-shaped assets when needed for automation.

Backend behavior:

- Runs quality gates and publish workflows.
- Emits content lifecycle signals such as draft readiness and publication milestones.

### Agent 7: Social Agent

Mission:

- Monitor social surfaces and identify high-value engagement opportunities.

Queue runtime:

- Queue base: `social-tasks`
- Concurrency: 3

Task router coverage:

- `scan_twitter`
- `scan_hackernews`
- `scan_youtube`
- `draft_social_reply`
- `yt_competitive_analysis`

AI layer:

- Scores mentions for sentiment, intent, engagement value, and whether to engage.
- Drafts platform-appropriate responses under format constraints.

Backend behavior:

- Scans channels, deduplicates mentions, and stores scored records.
- Auto-enqueues reply-draft tasks for high-value mentions.
- Emits social mention and competitive intelligence signals.

### Agent 8: Reddit Agent

Mission:

- Detect relevant subreddit mentions, score engagement value, and support safe response workflows.

Queue runtime:

- Queue base: `reddit-tasks`
- Concurrency: 3

Task router coverage:

- `scan_subreddits`
- `draft_reply`
- `post_reply`

AI layer:

- Scores mention sentiment and intent.
- Decides whether engagement is likely to be helpful.
- Drafts human-style community-safe replies.

Backend behavior:

- Searches monitored subreddits.
- Deduplicates and stores mentions.
- Enqueues follow-up draft tasks for engageable posts.
- Emits mention-detected and reply-posted signals.

### Agent 9: GEO Agent

Mission:

- Improve local discoverability through local keyword intelligence, rank checks, citation audits, and local schema generation.

Queue runtime:

- Queue base: `geo-tasks`
- Concurrency: 3

Task router coverage:

- `geo_keyword_research`
- `geo_rank_check`
- `geo_citation_audit`
- `geo_schema_generate`

AI layer:

- Clusters and prioritizes local keywords by intent.
- Generates local business schema markup.

Backend behavior:

- Uses web search signals as local keyword evidence.
- Triggers downstream tasks for rank checks.
- Can trigger content-writer tasks for local content production.

### Agent 10: Sales Pipeline Agent

Mission:

- Improve pipeline quality, conversion confidence, and revenue predictability.

Queue runtime:

- Queue base: `sales-pipeline-tasks`
- Concurrency: 5

Task router coverage:

- `icp_build`
- `lead_score`
- `deal_resurrection`
- `pipeline_forecast`
- `objection_battlecard`
- `call_analysis`
- `win_loss_analysis`
- `lead_suppression`
- `territory_assignment`
- `pricing_pattern_recommend`

AI layer:

- Uses llm-router fast and long-form modes for scoring, recommendations, and executive summaries.

Backend behavior:

- Runs structured sales analyses and action-generation tasks.
- Emits sales signals that can influence outreach and planning workflows.

### Agent 11: Outbound Agent

Mission:

- Plan and protect outbound motion through sequence strategy, lead quality checks, campaign scoring, and deliverability safety.

Queue runtime:

- Queue base: `outbound-tasks`
- Concurrency: 4

Task router coverage:

- `sequence_build`
- `campaign_score`
- `lead_verification`
- `competitor_monitor`
- `email_warmup`

AI layer:

- Uses llm-router content-writing style outputs for sequencing and messaging logic.

Backend behavior:

- Verifies leads and monitors competitor and warmup conditions.
- Emits outbound readiness and risk-related signals.

### Agent 12: Finance Agent

Mission:

- Turn financial data and assumptions into CFO-ready decision support.

Queue runtime:

- Queue base: `finance-tasks`
- Concurrency: 3

Task router coverage:

- `cfo_briefing`
- `cost_estimate`
- `scenario_model`

AI layer:

- Uses llm-router with CFO-oriented prompts in both fast-analysis and long-form modes.

Backend behavior:

- Produces analysis artifacts for planning and executive reviews.
- Emits finance-related signals from handler workflows where appropriate.

### Agent 13: Podcast Agent

Mission:

- Transform long-form podcast source material into reusable, channel-ready growth assets.

Queue runtime:

- Queue base: `podcast-tasks`
- Concurrency: 4

Task router coverage:

- `podcast_ingest`
- `content_extract`
- `content_generate`
- `viral_score`
- `calendar_build`

AI layer:

- Uses llm-router fast and long-form modes for extraction, repurposing, and planning.

Backend behavior:

- Maintains ingest-to-asset workflow progression.
- Emits signals after ingest and generation phases to support downstream planning.

### How Agents Handoff Work To Each Other

The system is not a set of isolated bots. Handlers can enqueue downstream tasks and emit signals.

Concrete examples in current flows:

- Social mention scan can enqueue `draft_social_reply` tasks.
- Reddit scan can enqueue `draft_reply` tasks for engageable mentions.
- GEO keyword research can enqueue GEO rank checks and content-writer blog tasks.
- Compatibility onboarding completion activates agents based on connected platform coverage.
- SEO and AEO task families include cross-strategy update paths.

### How Agent Health, Control, And Auditability Work

Under the hood, each agent is observable and controllable:

- Agent status is reflected in database records (`idle`, `processing`, and task linkage).
- Heartbeats are published on interval and persisted in Redis.
- Task progress can be updated by handlers during execution.
- Completion and failure events are published for downstream consumers.
- Management controls (pause, resume, restart, emergency stop) operate on these execution primitives.

### Why This Matters To Managers And Customers

- You can see what each agent is responsible for.
- You can understand which tasks are automated, suggested, or approval-gated.
- You can trace outcomes back to specific agent actions and data sources.
- You can scale from a few enabled agents to a full coordinated fleet safely.

## Background Capabilities That Often Start Without A Button Click

Not every capability starts from a visible front-end button. Many are triggered by schedules, events, connector syncs, or agent signals.

### 12) Sales Pipeline Functions

Typical triggers:

- new leads in CRM
- deal stage changes
- call transcript arrival
- manager-requested scoring review

AI actions under the hood:

- lead scoring
- ideal-customer-pattern extraction
- revival opportunity detection for stalled deals

Backend actions under the hood:

- merges lead/deal/call context
- writes scored outputs and recommended follow-up tasks
- emits signals for downstream agents and dashboards

Outcome:

- Better pipeline quality and more focused sales attention

### 13) Outbound Functions

Typical triggers:

- verified lead pool updates
- outbound planning cycles
- deliverability or competitor-change signals

AI actions under the hood:

- sequence strategy generation
- campaign scoring
- warmup and risk recommendations

Backend actions under the hood:

- validates lead quality and campaign constraints
- routes tasks to outbound workflows and monitoring services

Outcome:

- Higher outbound precision with lower deliverability risk

### 14) Finance Functions

Typical triggers:

- monthly close cadence
- anomaly detection
- leadership reporting requests

AI actions under the hood:

- executive briefing generation
- scenario projection and risk explanation

Backend actions under the hood:

- ingests financial signals, compares trends, and stores variance summaries

Outcome:

- Faster executive decision support with clearer risk visibility

### 15) Podcast Repurposing Functions

Typical triggers:

- transcript upload
- content atomization request

AI actions under the hood:

- topic extraction
- derivative content generation
- traction scoring

Backend actions under the hood:

- stores source-to-asset lineage so teams can track what came from each episode

Outcome:

- One long-form asset becomes a reusable multi-channel content engine

### 16) Social, Reddit, And YouTube Intelligence

Typical triggers:

- scheduled monitoring windows
- brand mention checks
- competitor watch alerts

AI actions under the hood:

- mention sentiment/context classification
- trend summarization
- response drafting suggestions

Backend actions under the hood:

- ingests channel events and normalizes noisy public signals into structured insights

Outcome:

- Faster reputation awareness and smarter response planning

### 17) GEO And Local Search

Typical triggers:

- local audit requests
- citation consistency checks
- location visibility review cycles

AI actions under the hood:

- local visibility scoring
- inconsistency and gap detection

Backend actions under the hood:

- compares business-location signals and stores discrepancy tasks

Outcome:

- Stronger local discoverability and fewer listing inconsistencies

### 18) Team Operations Extraction

Typical triggers:

- meeting transcripts
- operational review cycles

AI actions under the hood:

- action-item extraction
- decision logging
- open-question surfacing

Backend actions under the hood:

- writes structured follow-up tasks and links them to owners/timelines

Outcome:

- Less operational drift and clearer execution accountability

## What Happens When Something Goes Wrong

Common situations and how the platform responds:

1. Connector degradation: status changes to warning/error, reconnect guidance appears, and affected recommendations are confidence-adjusted.
2. Agent failure spike: retries and health checks trigger; managers can pause/restart specific agents or use emergency stop.
3. Risk threshold crossed: proposed action enters approval queue automatically instead of auto-execution.
4. Webhook delivery failure: retry pipeline runs with delivery telemetry; failure streak is visible in webhook dashboard.
5. Missing data windows: analytics still renders with transparent confidence and coverage indicators.

## Why Managers Feel The Platform Is "Alive"

The platform appears alive because several loops are always running:

- Monitoring loop: checks health and performance continuously
- Decision loop: reprioritizes based on new evidence
- Execution loop: routes and runs tasks safely
- Governance loop: enforces autonomy and approval policy
- Learning loop: updates recommendations from observed outcomes

That is the operational "magic": always-on loops, not one-time reports.

## Practical Weekly Operating Rhythm

Recommended manager cadence:

1. Monday: review dashboard health, top opportunities, and approval queue.
2. Tuesday: run scanner if site/tracking changed; verify integrations.
3. Wednesday: review campaign and creative performance; approve high-impact optimizations.
4. Thursday: run AEO and social intelligence checks; evaluate visibility shifts.
5. Friday: review analytics trend movement and next-week mission plan.

This rhythm keeps the platform in a continuous improvement cycle.

## What Customers Should Expect

- A fast path from setup to useful actions
- Plain-English recommendations with clear rationale
- Human control when risk is high
- Better coordination across previously fragmented tools
- Progressive improvement that compounds over time

## What Stakeholders Should Expect

- Traceable decisions from click to action to result
- Tenant-safe isolation and operational governance
- Reliable execution infrastructure behind AI recommendations
- A platform that behaves like an operating system, not a static dashboard

## Short Summary

NexusZero turns user clicks into secure requests, tenant-scoped context, orchestrated AI tasks, policy-checked execution, and measurable outcomes. From sign up to onboarding to full feature activation, the platform keeps improving performance through continuous monitoring, recommendation, execution, and learning loops.
