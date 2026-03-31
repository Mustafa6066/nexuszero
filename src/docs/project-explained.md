# Claude Code Architecture Guide

This document explains what this project is, what each major part does, and how a request moves through the system.

The goal is to describe the real codebase in plain language, not to give a vague summary.

## 1. What This Project Actually Is

This project is a terminal-based AI coding assistant.

At a high level, it does five things:

1. It shows a terminal user interface.
2. It keeps a live conversation state.
3. It sends prompts to an AI model.
4. It lets the AI use structured tools.
5. It manages long-running work, remote sessions, plugins, and settings.

The most important idea is this:

the AI is not only generating text. It is working inside a controlled runtime that can read files, edit code, run commands, launch tasks, and talk to other systems.

So this is not just a chat app. It is an agent runtime wrapped in a CLI.

## 2. One-Sentence Mental Model

If you want a simple mental picture, think of the project like this:

- `main.tsx` starts the program.
- `setup.ts` prepares the session and machine state.
- `QueryEngine.ts` owns the conversation.
- `query.ts` runs the turn-by-turn model loop.
- `Tool.ts` and `tools.ts` define what the model can do.
- `Task.ts` and `tasks.ts` manage long-running work.
- `state/` stores the live session state.
- `components/` renders the terminal UI.
- `bridge/` handles remote-session and bridge behavior.
- `services/`, `utils/`, `skills/`, and `plugins/` provide the rest of the system.

## 3. The Fastest Way To Understand The Project

The easiest way to understand the repo is to follow one request through the system.

### Full flow

```text
User input
  -> main.tsx / setup.ts
  -> AppState + command/tool registries
  -> QueryEngine.submitMessage()
  -> query() loop
  -> model response stream
  -> optional tool calls
  -> tool execution / tasks / permissions
  -> more model turns if needed
  -> UI update + transcript saved
```

Everything in the codebase supports that flow.

## 4. Startup: What Happens When The Program Launches

### `main.tsx`

`main.tsx` is the real startup entry point.

This file is important for two reasons:

1. It starts the program.
2. It is heavily optimized for startup speed.

It does early work such as:

- recording startup profiling checkpoints,
- prefetching managed-device settings,
- prefetching secure storage values,
- loading feature-gated modules,
- loading commands, tools, skills, plugins, and bridge features,
- initializing analytics and policy-related state,
- setting up the runtime mode for the current session.

One important detail: import order in `main.tsx` matters. Some imports intentionally run side effects early so expensive work happens in parallel.

That means `main.tsx` is not just a place where imports happen. It is part of the performance design.

### `setup.ts`

`setup.ts` prepares the environment before the session starts doing useful work.

It handles things like:

- checking that Node.js is new enough,
- setting the current working directory,
- restoring interrupted terminal setup state,
- capturing hook configuration,
- starting file change watchers,
- optionally creating worktrees,
- optionally creating tmux sessions,
- setting up session-specific infrastructure.

Plain-language summary:

`setup.ts` makes sure the app is running in the right place, with the right environment, and with the right session scaffolding.

## 5. What The User Interface Is Made Of

This project uses React and Ink.

### Why React is here

React is used because the app has a real interface, not just plain terminal prints.

The UI has:

- multiple components,
- panels,
- dialogs,
- task views,
- notifications,
- status pills,
- streamed output,
- mode-dependent layouts.

### Why Ink is here

Ink lets React render inside a terminal instead of a browser.

So the UI uses React-style components, but the actual output is terminal text and layout.

### Where UI state comes from

The UI reads almost everything from the central app state in `state/`.

That means the UI is reactive: when the state changes, the right parts of the interface update automatically.

## 6. App State: The Project's Live Memory

The central state definition lives in `state/AppStateStore.ts`.

This is one of the most important files in the repo because it defines what the application knows at runtime.

The state includes things like:

- settings,
- current model,
- conversation messages,
- running tasks,
- permission state,
- plugin state,
- MCP clients and resources,
- notifications,
- bridge state,
- remote-session state,
- todo lists,
- optional browser/tmux panel state,
- session hook state.

### How the store works

The small store implementation is in `state/store.ts`.

It is intentionally simple:

- `getState()` reads the current state,
- `setState()` creates a new state from the old one,
- `subscribe()` lets the UI react to changes.

This is a lightweight, predictable store design.

### How React connects to it

`state/AppState.tsx` provides:

- the React context provider,
- hooks like `useAppState(...)`,
- selector-based subscriptions,
- wiring for settings changes.

A very important pattern here is selector-based reading.

Instead of re-rendering every component for every change, the UI reads only the part of state it needs.

That keeps the UI efficient.

## 7. Messages: The Data That Moves Through The System

The whole application revolves around messages.

The user types a request, and that request becomes structured message data.

The system works with several kinds of messages, including:

- user messages,
- assistant messages,
- system messages,
- attachment messages,
- tool result messages,
- summary or compacted messages,
- tombstone or internal control messages.

Why this matters:

the app is not passing around raw strings. It is passing around structured conversation state.

That makes it possible to:

- stream partial responses,
- preserve tool call history,
- compact old context,
- resume sessions,
- attach files and memory,
- inject system instructions safely.

## 8. The Query Engine: Who Owns The Conversation

The main class is `QueryEngine` in `QueryEngine.ts`.

This class owns the conversation lifecycle for one session.

It keeps track of:

- the current message list,
- the current file-read cache,
- permission denials,
- accumulated usage,
- loaded memory attachments,
- discovered skills,
- the shared abort controller.

### What `QueryEngine.submitMessage()` does

When the user sends a prompt, `submitMessage()`:

1. accepts the prompt,
2. updates session-scoped state,
3. builds the context for the turn,
4. calls into `query.ts`,
5. yields results back as the model and tools stream output,
6. records usage and transcript information.

It is the session-level wrapper around the lower-level query loop.

## 9. `query.ts`: The Real Turn Loop

`query.ts` is where the turn-by-turn execution logic lives.

This file is one of the best places to study if you want to know how the product actually works.

### What `query()` is

`query()` is an async generator.

That means it can produce output in pieces over time instead of returning once at the end.

This is a perfect fit for this project because the app needs to:

- stream model output,
- stream tool progress,
- emit intermediate state,
- recover from token-limit situations,
- compact history when needed,
- continue the same turn across multiple tool calls.

### What happens inside `query()`

At a high level, the query loop does this:

1. starts a new request stream,
2. prepares the message list for the turn,
3. prefetches memory and skill information,
4. applies tool-result budgeting,
5. runs context shrinking systems when needed,
6. builds the final system prompt and context,
7. calls the model API,
8. streams the response,
9. executes tool calls if the model requested them,
10. feeds tool results back into the conversation,
11. repeats until the turn is finished.

### Context-size control features in `query.ts`

The file clearly shows that the project has several separate context-management systems.

They are not all the same thing.

#### Microcompact

This is a small, targeted shrinking step.

It tries to reduce context size without doing a full summary rewrite.

#### Snip compact

This removes older conversation pieces when they are no longer needed.

#### Context collapse

This keeps a collapsed view of older information so the app does not have to carry full raw history all the time.

#### Autocompact

This is the bigger system that summarizes history when the context becomes too large.

### Why these systems exist

Model context is limited.

If the app kept every message forever in raw form, long sessions would break.

So this project treats context management as a first-class concern.

## 10. Commands: What The User Invokes Directly

Commands are registered in `commands.ts`.

This file is the command registry for the app.

It imports built-in commands and builds the final command list.

### Important command idea: there are three kinds

The shared command types live in `types/command.ts`.

The three main command forms are:

#### Prompt commands

These do not directly run UI code or local logic first.

Instead, they build prompt content for the model.

Use these when the command itself is an AI workflow.

Example idea:

"take these arguments, build structured prompt blocks, and let the model handle the task."

#### Local commands

These run local code directly.

Use these when the command does not need model reasoning.

#### Local JSX commands

These open interactive terminal UI powered by Ink.

Use these when the command needs menus, dialogs, or visual interaction.

### Why this split is good

It keeps responsibilities clear.

- some things are just UI,
- some things are pure local logic,
- some things are model-guided workflows.

That separation makes the system easier to extend and reason about.

### Other command details

Commands also support ideas like:

- aliases,
- availability restrictions,
- feature-based enablement,
- hidden commands,
- plugin-loaded commands,
- MCP-loaded commands,
- argument hints,
- forked execution contexts.

So commands are more than just a string-to-function map.

## 11. Tools: What The Model Is Allowed To Do

If commands are for the user, tools are for the model.

This is one of the biggest concepts in the repo.

### What a tool is

A tool is a structured capability the model can call.

Examples in this project include:

- reading files,
- editing files,
- writing files,
- searching files,
- running bash or PowerShell,
- asking the user a question,
- managing tasks,
- invoking skills,
- using sub-agents,
- reading MCP resources,
- opening browser or REPL-based capabilities in some builds.

### Where tools are defined

- shared tool types: `Tool.ts`
- tool registry: `tools.ts`
- implementations: `tools/`

### Why `Tool.ts` matters

`Tool.ts` defines the shared contract tools use, especially `ToolUseContext`.

That context carries things like:

- available commands,
- available tools,
- current model settings,
- state getters and setters,
- the abort controller,
- message history,
- file-state caches,
- permission context,
- MCP clients and resources,
- UI callbacks,
- task update hooks.

This is why tools are powerful but still controlled. They run inside a structured runtime with the session context they need.

### How the tool registry works

`tools.ts` collects every tool that could exist in the current runtime.

It then filters by things like:

- feature flags,
- environment variables,
- user type,
- worktree mode,
- REPL mode,
- permission rules.

So the model never gets a flat, always-identical tool list.

The tool list depends on the session and the product mode.

## 12. Permissions: The Safety Layer Around Tools

Because tools are powerful, the repo has a full permission system.

The permission context includes rules for:

- always allow,
- always deny,
- always ask.

Rules can match tool names and tool patterns.

Examples from the codebase include rule shapes like:

- `Bash(git *)`
- `Read(*.py)`
- `Edit(!node_modules/**)`

### Why this exists

Without permissions, the assistant would just be a shell bot with too much power.

With permissions, the app can:

- expose only safe tools,
- ask the user before risky actions,
- deny tools entirely in some modes,
- support stricter automation policies.

This is one of the core control systems of the product.

## 13. Tasks: Long-Running Work

Some actions finish immediately. Others take time.

That is why the project has a separate task system.

### Where tasks are defined

- shared task types: `Task.ts`
- task registry: `tasks.ts`
- implementations: `tasks/`

### Task model

The task system supports task types such as:

- `local_bash`
- `local_agent`
- `remote_agent`
- `in_process_teammate`
- `local_workflow`
- `monitor_mcp`
- `dream`

Each task has structured state such as:

- id,
- type,
- status,
- description,
- timing,
- output file location,
- notification state.

### Why tasks are separate from tools

A tool call is one action.

A task is something that can continue after the tool call that created it.

For example:

- the model asks to start a background shell command,
- the tool starts it,
- the task system keeps tracking it,
- the UI can later inspect or stop it.

This split is clean and important.

## 14. Skills: Reusable AI Workflows

Skills are packaged AI workflows and prompt behaviors.

They are not the same as tools.

### How to think about a skill

A tool is a capability.

A skill is a reusable way of solving a kind of problem.

You can think of a skill as a playbook for the assistant.

### Where skills are handled

- bundled skill registration: `skills/bundled/index.ts`
- filesystem skill loading: `skills/loadSkillsDir.ts`

### What the loader does

The skill loader reads markdown-based skill definitions and frontmatter.

From the code, you can see that skills can define things like:

- description,
- allowed tools,
- argument names,
- `whenToUse`,
- model overrides,
- hooks,
- effort level,
- execution context,
- agent type,
- path restrictions.

### Why this matters

This gives the assistant reusable behavior without hardcoding every workflow directly into the model loop.

## 15. Plugins: Extending The Product

The project has a plugin system.

Plugins can add commands, tools, or skills without forcing all behavior into the core source tree.

### What the visible code shows

`plugins/bundled/index.ts` is currently scaffolding for built-in plugins.

The rest of the app state and registries make it clear that plugins are first-class runtime features.

The app tracks:

- enabled plugins,
- disabled plugins,
- plugin commands,
- plugin errors,
- install status,
- refresh state.

### Why plugins matter

They make the app extensible.

Instead of turning the core repo into one giant pile of built-in features, the system can load features dynamically.

## 16. MCP: External Tools And Resources

MCP means Model Context Protocol.

In this project, MCP is the structured way the assistant connects to outside servers that can provide more tools, commands, or resources.

### What the app stores for MCP

The app state includes:

- MCP clients,
- MCP tools,
- MCP commands,
- MCP resources.

The tool layer also includes MCP resource tools such as listing resources and reading resources.

### Why MCP matters

It lets the assistant go beyond the local filesystem and local shell.

It is one of the main extensibility systems of the project.

## 17. The Bridge System: Remote Session Infrastructure

The `bridge/` directory is one of the more advanced parts of the repo.

### What it does

The bridge system connects the local CLI world to remote session management and remote control flows.

From `bridge/bridgeMain.ts`, you can see ideas like:

- environment registration,
- session spawning,
- polling for work,
- session heartbeats,
- reconnect behavior,
- backoff handling,
- token refresh scheduling,
- worktree cleanup,
- timeout handling,
- graceful shutdown.

### Plain-language summary

The bridge is the infrastructure that lets the product manage local work on behalf of remote systems and keep those sessions alive safely.

### Why it is separate

This logic is much more infrastructure-heavy than the normal local chat loop.

It needs its own subsystem because it deals with:

- remote APIs,
- long-lived sessions,
- polling loops,
- process spawning,
- reconnection,
- auth refresh.

## 18. Services: Integration Code

The `services/` directory is where integration-heavy logic lives.

This includes areas such as:

- model API handling,
- analytics,
- compacting history,
- MCP clients,
- policy limits,
- prompt suggestions,
- LSP support,
- session memory,
- token estimation,
- tool orchestration.

### Why services exist as a separate layer

They keep the core app files from turning into huge mixes of UI, orchestration, and external integration logic.

`main.tsx`, `QueryEngine.ts`, and `query.ts` rely on services, but do not need to contain every integration detail themselves.

## 19. `utils/`: The Glue Layer

The `utils/` directory is large because it contains reusable logic for many domains.

Examples include:

- auth,
- git,
- worktrees,
- shell helpers,
- settings,
- session storage,
- logging,
- diagnostics,
- error handling,
- token calculations,
- model selection,
- context building,
- plugin loading,
- permission setup,
- hooks,
- telemetry.

This layer is the glue that holds the rest of the app together.

## 20. Hooks: Two Different Meanings In One Repo

The word `hook` is used in two different ways.

### React hooks

These are normal React hooks used by UI code.

Examples include reading settings, reading permissions, reacting to terminal state, and consuming app state.

### Runtime hooks

These are session or tool lifecycle hooks.

From the visible code, the app supports hooks around things like:

- session start,
- compaction,
- stop handling,
- file changes,
- worktree behavior.

If you miss this distinction, the repo will feel confusing.

## 21. Feature Flags: Product Modes Built Into The Architecture

The repo uses `feature()` from `bun:bundle` throughout the code.

This means many parts of the app can be compiled in or out depending on product configuration.

### Why this is important

This is not a small optional detail. It shapes the whole architecture.

Feature flags control things like:

- voice mode,
- bridge mode,
- coordinator mode,
- browser tooling,
- workflow tooling,
- history snipping,
- proactive behavior,
- remote triggers.

### Practical consequence

Code often has patterns like:

- conditional imports,
- feature-gated modules that can be `null`,
- runtime checks before exposing commands or tools.

So the codebase is really a family of related products sharing one source tree.

## 22. Lazy Loading: A Performance And Structure Pattern

The repo uses lazy loading heavily.

### Why

Because the app is large and some modules are expensive.

Lazy loading helps with:

- startup speed,
- memory use,
- feature isolation,
- circular dependency control.

### Where you can see it

- lazy-loaded local commands,
- conditional `require()` calls in feature-gated areas,
- deferred loading of heavy modules,
- late loading of some team or assistant subsystems.

### Why this matters to developers

If you eagerly import everything, you can easily damage startup performance or reintroduce circular-import problems.

## 23. Types, Schemas, And Safety

This project relies on TypeScript types and runtime validation.

### TypeScript types

Types help describe the shape of data during development.

This improves:

- editor support,
- refactoring safety,
- API clarity,
- bug prevention.

### Branded types

The repo uses branded IDs for things like session IDs and agent IDs.

This is a way to make two strings behave like different kinds of values in the type system.

That reduces accidental mix-ups.

### Runtime validation

The codebase also uses schemas, especially Zod-based validation.

Why both are needed:

- TypeScript checks developer-written code,
- runtime validation checks real incoming data.

That matters for:

- settings,
- plugin manifests,
- hook config,
- MCP data,
- frontmatter,
- external API payloads.

## 24. Cost Tracking, Usage, And Token Budgeting

This app is built for real model usage, so it tracks usage carefully.

The visible code shows concepts like:

- accumulated usage,
- API duration,
- total cost,
- token warnings,
- output-token recovery,
- task budgets,
- context-token accounting.

### Why this matters

This is not a toy chat loop.

The system is designed for long-running, tool-using sessions where token cost and context size must be managed deliberately.

## 25. Thinking, Streaming, And Recovery Logic

The query system also handles several advanced behaviors.

### Streaming

Responses do not wait until the end.

The model and tools can stream progress back to the UI as work happens.

### Thinking blocks

The query layer contains rules around model thinking blocks and how they must be preserved in valid trajectories.

### Recovery logic

The loop includes recovery behavior for cases like:

- prompt too long,
- max output tokens reached,
- compaction retries,
- tool execution follow-up.

This is why the query loop is more complicated than a normal "call the model once" function.

## 26. Worktrees, Tmux, And Multi-Session Work

The codebase includes support for advanced developer workflows beyond a single shell command.

### Worktrees

The app can create or operate inside git worktrees so isolated tasks can run in separate working directories.

### Tmux

The app can create tmux sessions and track tmux-related state.

### Agent swarms and teammates

The code clearly supports multi-agent and teammate-style work in some modes.

That is why the repo includes things like:

- coordinator mode,
- teammate snapshots,
- team create/delete tools,
- agent registries,
- remote/background agent tasks.

This project is designed for more than a single-threaded local assistant.

## 27. What A Single User Request Looks Like In Practice

Imagine the user says:

"Read the config loader, find the bug, fix it, and verify the result."

Here is what the project does.

1. The UI turns the input into a user message.
2. `QueryEngine.submitMessage()` starts a new turn.
3. The engine builds the tool context, system prompt, and session context.
4. `query()` prepares the message history and checks context size.
5. Memory and skill discovery may prefetch in the background.
6. The model starts streaming a response.
7. The model decides it needs information and emits a tool-use block.
8. The tool system finds the requested tool.
9. Permissions are checked.
10. The tool runs, for example a file read or search.
11. The result is turned into a tool-result message.
12. The model continues with the new information.
13. If it wants to edit a file, it emits another tool-use block.
14. The edit tool runs inside the same structured context.
15. If verification is needed, a task or shell tool may run.
16. The UI streams all of this while it happens.
17. The final answer is shown.
18. Transcript, usage, and session state are updated.

That loop is the center of the product.

## 28. Main Directories And What They Mean

| Path | What it is for |
|---|---|
| `main.tsx` | startup entry point |
| `setup.ts` | environment and session preparation |
| `QueryEngine.ts` | conversation owner for a session |
| `query.ts` | low-level turn loop |
| `commands.ts` | built-in command registry |
| `commands/` | command implementations |
| `Tool.ts` | shared tool contracts and context |
| `tools.ts` | tool registry and filtering |
| `tools/` | tool implementations |
| `Task.ts` | shared task model |
| `tasks.ts` | task registry |
| `tasks/` | task implementations |
| `state/` | app state and React store wiring |
| `components/` | terminal UI components |
| `bridge/` | remote session and bridge infrastructure |
| `services/` | integrations and orchestration helpers |
| `skills/` | reusable AI workflows |
| `plugins/` | plugin system |
| `types/` | shared types |
| `schemas/` | validation schemas |
| `utils/` | reusable helpers across domains |
| `migrations/` | setting and version migration logic |

## 29. Important Software Patterns Used In The Repo

Here are the main engineering patterns used in this codebase.

### Layered architecture

The repo is split into startup, orchestration, UI, tools, tasks, services, and infrastructure layers.

### Registry pattern

Commands and tools are collected in central registry files instead of being discovered by scattered code.

### Immutable state updates

State is replaced with updated copies rather than mutated in place.

### Async generators

The query system can yield partial results over time.

### Structured tool calling

The AI acts through formal tool contracts instead of raw text instructions.

### Background task orchestration

Long-running work is tracked separately from short-lived tool calls.

### Feature-gated product slices

One source tree supports multiple modes and builds.

### Lazy loading

Heavy modules load only when needed.

### Runtime validation

External data is checked before the app trusts it.

### Extensibility

Skills, plugins, MCP, and agent systems all let the product grow without rewriting the core loop.

## 30. Common Things That Confuse New Readers

### Command vs tool

A command is something the user invokes.

A tool is something the model invokes.

### Tool vs task

A tool is an action.

A task is long-running work that may outlive the original action.

### Skill vs tool

A skill is a reusable workflow or instruction set.

A tool is an executable capability.

### Plugin vs skill

A plugin extends the product itself.

A skill teaches the assistant how to approach a problem.

### React hooks vs runtime hooks

Not every `hook` in the repo is about React components.

### Bridge vs main query loop

The bridge is remote session infrastructure.

It is not the normal local conversation path.

## 31. Things You Should Not Change Carelessly

### `main.tsx` import order

It is part of startup behavior and performance.

### `.js` import suffixes

They are intentional for the ESM build style.

### Feature-gated `require()` patterns

They often exist to control build output or avoid loading code too early.

### React compiler markers like `_c()`

Those are generated markers, not hand-written business logic.

### Store selectors

Returning fresh objects from selectors can cause unnecessary re-renders.

## 32. Build And Test Notes From The Visible Workspace

The visible workspace does not show `package.json` or `tsconfig.json`.

So this folder looks like a source-tree slice, not a fully visible repo root.

Even so, the code clearly tells us that:

- the runtime uses Bun,
- Node.js 18 or newer is required,
- the codebase is ESM-flavored TypeScript,
- Biome is used,
- ESLint is also present,
- feature flags are a central build concept.

I also did not find embedded test files in this visible tree, so tests likely live elsewhere or are handled outside this slice of the repo.

## 33. Best Reading Order If You Want To Learn The Code

If you want to understand the repo without getting lost, read in this order:

1. `main.tsx`
2. `setup.ts`
3. `state/AppStateStore.ts`
4. `state/store.ts`
5. `state/AppState.tsx`
6. `QueryEngine.ts`
7. `query.ts`
8. `Tool.ts`
9. `tools.ts`
10. `Task.ts`
11. `tasks.ts`
12. `types/command.ts`
13. `commands.ts`
14. `bridge/bridgeMain.ts`
15. `skills/loadSkillsDir.ts`

That order shows the runtime from top to bottom.

## 34. Final Summary

This project is a structured AI agent platform for coding work in the terminal.

Its heart is a loop where:

- the user sends a request,
- the query engine builds context,
- the model responds,
- tools execute real actions,
- tasks carry long-running work,
- the UI streams progress,
- the session is saved.

Everything else in the repo exists to support that loop safely, efficiently, and across many product modes.

If you remember only one sentence, remember this:

Claude Code is a terminal app whose main job is to run a controlled, tool-using AI conversation loop.

## 35. Glossary

### CLI

Command-line interface. A program that runs in the terminal.

### Ink

A library that lets React render terminal interfaces.

### Query engine

The part of the app that owns the conversation and coordinates model calls.

### Tool

A structured action the model can request.

### Command

A built-in workflow the user invokes directly.

### Task

A longer-running job tracked by the app.

### App state

The central live data object for the current session.

### Skill

A reusable AI workflow or instruction package.

### Plugin

An extension that adds product behavior.

### MCP

Model Context Protocol, a structured way to expose external tools and resources.

### Bridge

The subsystem for remote session and remote control flows.

### Worktree

A separate git working directory for isolated work.

### Tmux

A terminal session manager used for multi-session workflows.