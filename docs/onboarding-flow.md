# NexusZero Onboarding Flow

## Goal

Design an onboarding experience that gets a new tenant from first visit to first operational value with minimal setup friction, high trust, and a clear path into daily product use.

This flow is built to fit the current NexusZero product model:

- Website-first entry via scanner and stack detection
- Multi-step backend onboarding state machine
- AI-agent orchestration across SEO, ads, data, AEO, and creative generation
- A command-center dashboard that should feel proactive rather than report-heavy

## Primary Onboarding Outcome

By the end of onboarding, the user should have all of the following:

1. A readiness baseline for their website and marketing stack
2. At least one concrete "Aha" insight or recommended opportunity
3. A clear understanding of what NexusZero will automate vs what requires approval
4. A live workspace with a first mission ready to act on

## Core Principles

1. Diagnose before demanding setup
2. Show value before asking for more information
3. Keep the user in an outcome-oriented mission, not a generic configuration wizard
4. Make every automated step legible and reversible
5. Let the user skip deeper setup without losing forward progress

## Entry Points

There are three valid onboarding entry points.

### Entry A: New tenant first login

- Trigger: new owner account created or first authenticated session
- Landing: `Welcome / Mission Capture`
- Goal: establish intent and start a scan-driven onboarding

### Entry B: Existing user with no integrations

- Trigger: authenticated tenant with empty integration state
- Landing: `Connect Your Stack`
- Goal: recover into onboarding without forcing a restart of the account

### Entry C: Scanner-first discovery path

- Trigger: user starts on the scanner page before full onboarding
- Landing: `Opportunity Snapshot`
- Goal: convert a diagnostic action into a guided onboarding path

## High-Level Flow

```text
Welcome / Mission Capture
  -> Website Scan
  -> Opportunity Snapshot
  -> Connection Plan
  -> Guided Setup Progress
  -> Strategy Review
  -> Go Live Confirmation
  -> Activation Success / First Mission
```

Recovery branches:

- Scan fails -> Manual path or retry
- No integrations detected -> Deep scan or manual connect
- OAuth/connect step stalls -> continue with partial setup
- Backend step fails -> focused recovery screen with resume path

## Screen 1: Welcome / Mission Capture

### Purpose

Start the experience with outcomes, not configuration. Give the user a sense that NexusZero is about to operate on their behalf.

### Primary questions

1. What do you want NexusZero to improve first?
2. What website or domain should we analyze?
3. Which channel matters most right now?

### Layout

- Left: short value framing
- Right: guided form card
- Bottom: proof row with what the scan will detect

### Inputs

- `websiteUrl`
- `primaryGoal`
  - Improve lead generation
  - Reduce ad waste
  - Increase AI visibility
  - Launch campaigns faster
  - Diagnose what is broken
- `primaryChannel`
  - Paid
  - SEO
  - AI search
  - Full-funnel

### Primary CTA

`Analyze my setup`

### Secondary CTA

`Skip for now and explore manually`

### Screen-level states

#### State 1A: Default

- Empty fields
- Promise of a 90-second setup analysis
- Microcopy: "We’ll detect your stack, surface quick wins, and show what can be automated."

#### State 1B: Valid URL entered

- Enable CTA
- Inline domain preview
- Show trust badges: secure scan, read-only detection, no external changes yet

#### State 1C: Invalid or risky URL

- Inline error
- Explain acceptable input examples
- If SSRF or private-network-like target: explain why it is blocked

#### State 1D: Resume detected

- If tenant already has partial onboarding state, replace form with:
  - current progress summary
  - `Resume setup`
  - `Start over`

## Screen 2: Website Scan

### Purpose

Turn the first backend action into a visible, high-confidence discovery moment.

### Data sources

- `runPreflightScan(websiteUrl)`
- stack detection and scanner results

### Layout

- Large progress rail
- Live activity feed
- "What we are checking" checklist
- Optional assistant side note: what this means for the user’s goal

### Primary UX behavior

The scan should feel fast, legible, and evidence-driven.

### Screen-level states

#### State 2A: Starting scan

- Progress starts immediately
- Checklist categories visible:
  - Analytics
  - Ads
  - SEO
  - Performance
  - Security
  - CMS

#### State 2B: Live scanning

- Each category transitions independently
- Surface real findings as they arrive:
  - "Google Analytics detected"
  - "No sitemap found"
  - "Strong HTTPS posture"

#### State 2C: Fast success

- Show readiness score
- Summarize detected technologies
- Route directly to `Opportunity Snapshot`

#### State 2D: Partial detection

- Explain what was detected and what remains uncertain
- Offer:
  - `Continue with partial data`
  - `Run deep scan`
  - `Connect manually`

#### State 2E: No auto-detection

- Avoid framing as failure
- Copy: "This site is harder to fingerprint automatically. You can still continue."
- Show likely reasons:
  - SPA architecture
  - strict bot blocking
  - server-side rendering limits
- CTAs:
  - `Run deep scan`
  - `Continue with manual connections`

#### State 2F: Scan failed

- Show specific reason if available
- Preserve the entered URL and intent
- CTAs:
  - `Retry scan`
  - `Continue manually`

## Screen 3: Opportunity Snapshot

### Purpose

Deliver the first "Aha" moment. This is the most important screen in the onboarding flow.

### What the user should see

1. Readiness score
2. Top 3 opportunities
3. Top 1 risk
4. Recommended agent mix
5. Recommended mission to start with

### Layout

- Hero summary card
- Three opportunity cards
- One risk card
- Agent recommendations rail
- CTA cluster for the next path

### Example output

- "Tracking is only partially configured; attribution confidence is low."
- "SEO fundamentals are solid, but AI visibility is weak on branded entity coverage."
- "Meta and Google Ads can be connected immediately."

### Primary CTA

`Set up my recommended path`

### Secondary CTA cluster

- `Review detected stack`
- `Run deep scan`
- `Skip to dashboard`

### Screen-level states

#### State 3A: High readiness

- Emphasis on speed to activation
- CTA label: `Activate recommended automations`

#### State 3B: Medium readiness

- Emphasis on one or two blocking fixes
- CTA label: `Fix blockers and continue`

#### State 3C: Low readiness

- Emphasis on setup-first guidance
- CTA label: `Guide me through the essentials`

#### State 3D: Goal-personalized snapshot

- The top recommendation changes based on `primaryGoal`
- Example:
  - lead generation -> connect CRM and analytics first
  - reduce ad waste -> connect ad platform and launch spend audit first
  - AI visibility -> start AEO scan and entity profile setup first

## Screen 4: Connection Plan

### Purpose

Translate detected opportunities into a staged integration plan. This should feel like a recommendation engine, not a settings form.

### What the user sees

- Recommended connections first
- Optional connections second
- Manual connections last
- Expected unlocks for each platform

### Card structure per integration

- Platform name
- Detected confidence or reason for recommendation
- What unlocking this connection enables
- Setup difficulty: Instant / 2 min / Manual
- CTA: `Connect`

### Primary CTA

`Continue with recommended connections`

### Secondary CTA

`Skip and continue with limited automation`

### Screen-level states

#### State 4A: Auto-detected + connectable

- Badge: `Recommended now`
- Expected benefit example: "Unlocks ad waste diagnostics and bid recommendations"

#### State 4B: Recommended but not auto-detected

- Badge: `Manual setup`
- Show why it still matters

#### State 4C: Connecting in progress

- Per-card loading state
- Show callback or API key instructions depending on platform

#### State 4D: Connected success

- Replace CTA with success badge and unlocked capability text

#### State 4E: Connection failed

- Inline platform-specific error summary
- `Retry`
- `Skip for now`
- `View troubleshooting`

#### State 4F: Partial completion

- Allow the user to proceed after minimum viable connection threshold is met
- Threshold should be based on primary goal, not a hard universal count

## Screen 5: Guided Setup Progress

### Purpose

Convert backend orchestration into an understandable, confidence-building setup experience.

This is the right home for a refined version of the current cinematic onboarding, but it must be tied to real backend states first and simulated activity second.

### Layout

- Progress header with current phase
- Current system action
- Real activity feed
- Agent-by-agent status strip
- Bottom drawer for "What happens next"

### Backend-to-screen mapping

| Backend state | Screen title | User-facing label |
|---|---|---|
| `created` | Setup queued | Preparing workspace |
| `oauth_connecting` | Connecting stack | Connecting your platforms |
| `oauth_connected` | Connections ready | Your stack is verified |
| `auditing` | Running analysis | Agents are auditing your setup |
| `audit_complete` | Audit complete | Baseline established |
| `provisioning` | Provisioning workspace | Creating your command center |
| `provisioned` | Workspace ready | Your environment is configured |
| `strategy_generating` | Building strategy | Generating your first plan |
| `strategy_ready` | Strategy ready | Review your launch plan |
| `going_live` | Activating agents | Launching your swarm |
| `active` | Fully live | Command center ready |
| `failed` | Action needed | Setup hit a blocker |

### Screen-level states

#### State 5A: Real backend progress available

- Use actual onboarding state as primary status
- Show progress percentages from `getProgress()`

#### State 5B: Real state + synthetic enrichment

- If backend events are sparse, enrich with supporting messages that do not fake completion
- Example: "SEO agent is preparing baseline checks"

#### State 5C: Waiting on user auth step

- Pause the progress flow and switch to action-required mode
- Show exactly which connection or approval is blocking progress

#### State 5D: Background progression complete

- Auto-route to `Strategy Review`

#### State 5E: Failure

- Stop animation immediately
- Show:
  - what failed
  - what completed successfully
  - what remains safe to use
  - one focused recovery CTA

## Screen 6: Strategy Review

### Purpose

Present the generated plan before full go-live. This is the trust checkpoint.

### What the user sees

- Recommended mission for the next 7 days
- Top priorities by impact and confidence
- Proposed active agents
- Approval mode selection

### Layout

- Summary hero: "Here is your recommended operating plan"
- Three-column plan cards:
  - Immediate fixes
  - High-confidence automations
  - Human review items
- Agent activation panel
- Automation mode selector

### Automation modes

1. Observe only
2. Recommend and require approval
3. Autopilot for safe actions only

### Primary CTA

`Go live with this plan`

### Secondary CTA

- `Edit priorities`
- `Start in observe mode`
- `Return to connections`

### Screen-level states

#### State 6A: Default strategy ready

- Default highlight on one mission path
- Emphasize quick win in under 24 hours

#### State 6B: Low-confidence strategy

- If connection coverage is weak, label some recommendations as provisional
- Encourage observe mode by default

#### State 6C: Enterprise review mode

- If plan/tier or role requires approval, allow export/share for stakeholder signoff

## Screen 7: Go Live Confirmation

### Purpose

Create a deliberate activation moment and clarify what happens next.

### What the user approves

- Which agents activate now
- What monitoring starts immediately
- Which actions require approval
- Which notifications and daily briefings are enabled

### Primary CTA

`Activate my command center`

### Secondary CTA

`Start in observe mode`

### Screen-level states

#### State 7A: Full activation

- High-confidence setup, sufficient integrations, strategy approved

#### State 7B: Limited activation

- Partial setup detected
- Make clear that some capabilities will remain locked until integrations are added

#### State 7C: Compliance-aware activation

- If webhooks, autopilot, or external actions are enabled, present concise confirmation text

## Screen 8: Activation Success / First Mission

### Purpose

Turn onboarding completion into immediate ongoing usage. Do not dump the user into a generic dashboard home.

### What the user should see

1. Command center status: live
2. Connected platforms
3. Activated agents
4. First mission card
5. Daily briefing expectation

### Recommended primary CTAs

- `Open my daily brief`
- `Review first opportunities`
- `Launch first recommended action`

### Suggested first mission examples

- Fix tracking quality before optimization begins
- Approve top 3 ad waste reductions
- Generate and review first creative pack
- Review AI visibility gaps for core branded queries

### Screen-level states

#### State 8A: Fully live

- Show strongest win summary and route into Overview or Opportunity Queue

#### State 8B: Live with blockers remaining

- Command center active, but a `Next unlocks` panel remains visible

#### State 8C: Post-onboarding checklist

- Short checklist only if it drives value
- No long admin to-do list

## Recovery Flows

### Recovery 1: Scan or detection failure

- Preserve all prior inputs
- Offer deep scan or manual path
- Never force the user back to the first screen

### Recovery 2: OAuth or connection failure

- Stay inside the connection plan screen
- Show one-card troubleshooting
- Let the rest of onboarding continue in partial mode

### Recovery 3: Backend onboarding failure

- Route to a focused blocker screen with:
  - failed step
  - successful completed steps
  - safe-to-use features
  - retry CTA
  - support escalation CTA

### Recovery 4: User exits mid-flow

- On next session, present a resume banner:
  - current state
  - percent complete
  - last successful milestone
  - one-click resume

## Resume Logic

On login, evaluate `tenant.onboardingState`.

- `created` -> start at Screen 1
- `oauth_connecting` or `oauth_connected` -> resume at Screen 4 or 5 depending on outstanding user action
- `auditing`, `provisioning`, `strategy_generating`, `going_live` -> resume at Screen 5
- `strategy_ready` -> resume at Screen 6
- `failed` -> route to focused recovery state
- `active` -> do not show onboarding; route to dashboard with first-mission banner if onboarding was completed less than 7 days ago

## Smart Defaults

### Goal-to-first-mission routing

- Lead generation -> integrations + analytics baseline -> funnel and CRM mission
- Reduce ad waste -> connect ad platforms -> spend audit mission
- Improve AI visibility -> scanner + AEO path -> citation/entity mission
- Launch faster -> creative + campaign setup -> creative pack mission
- Diagnose issues -> scanner + opportunity queue -> top risk mission

### Minimum viable setup thresholds

Do not block activation on full integration coverage. Use goal-aware minimums.

- Paid-first user: one ad platform + analytics is enough to continue
- SEO/AEO-first user: website scan + search console or content platform is enough to continue
- Creative-first user: website + prompt + optional brand guidance is enough to continue

## Information Architecture Recommendation

The onboarding should not live as a small card inside the integrations page only.

Recommended product IA:

1. Full-screen onboarding shell for first-time tenants
2. Scanner remains as a standalone diagnostic tool
3. Integrations page becomes a post-onboarding management page
4. Cinematic progress view becomes a real progress screen in the onboarding shell
5. Completion routes into `Overview` or `Opportunity Queue`, not directly to a generic integrations grid

## Existing Surface Reuse

Current NexusZero pieces that should be reused:

- Scanner page for deep diagnostic mode
- Cinematic onboarding component as the progress shell foundation
- Integrations grid as the post-onboarding connection management surface
- Assistant panel as contextual onboarding help and explanation layer

Current surfaces that should be replaced or expanded:

- `OnboardingWizard` should evolve from a single-card quick setup into the full entry flow
- Current success handling should route into a mission-led activation screen instead of a flat completion message

## Success Metrics

Track onboarding quality with these metrics:

1. Time to first insight
2. Time to first connected platform
3. Time to first approved action
4. Onboarding completion rate
5. Percent of users who reach `active`
6. Percent of users who return within 24 hours
7. Percent of users who trigger one recommended mission in week one

## Final Product Requirement

If this onboarding is working correctly, a new user should be able to say:

"NexusZero understood my setup quickly, showed me what mattered, made setup feel guided instead of heavy, and got me to a live, useful command center without making me configure everything up front."