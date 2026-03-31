# Claude Code — Project Guidelines

## Architecture Overview

Claude Code is an AI-powered CLI coding assistant built with **TypeScript**, **React/Ink** (terminal UI), and the **Bun** runtime.

**Core layers:**

| Layer | Entry Point | Purpose |
|-------|-------------|---------|
| CLI entry | `main.tsx` → `setup.ts` → `entrypoints/` | Startup orchestration, profiling, arg parsing |
| Query engine | `QueryEngine.ts`, `query.ts` | Conversation loop: user → LLM → tool calls → repeat |
| Commands | `commands.ts` + `commands/` | Slash commands (170+): prompt, local, and local-jsx types |
| Tools | `Tool.ts`, `tools.ts` + `tools/` | LLM-callable tools (40+): Bash, FileEdit, Agent, MCP, etc. |
| Tasks | `Task.ts`, `tasks.ts` + `tasks/` | Background work: local_bash, local_agent, remote_agent, etc. |
| State | `state/AppStateStore.ts`, `state/AppState.tsx` | Immutable centralized state via Zustand-like custom store |
| Bridge | `bridge/` | Always-on remote session bridge to claude.ai |
| Services | `services/` | API clients, MCP, analytics, OAuth, LSP, plugins |
| UI | `components/` | 140+ Ink/React terminal components |

## Code Style

### Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Constants | `UPPER_CASE` | `FILE_EDIT_TOOL_NAME` |
| Functions | `camelCase` | `isCoordinatorMode()` |
| Types/Interfaces | `PascalCase` | `PermissionMode`, `BundledSkillDefinition` |
| Branded types | `string & { __brand }` | `type SessionId = string & { __brand: 'SessionId' }` |
| React components | `PascalCase`, default export | `Message`, `StatusLine` |
| React hooks | `useX` | `useSettings()`, `useCanUseTool()` |
| CLI commands | kebab-case | `/advisor`, `/commit-push-pr` |
| Tool dirs | `PascalCase` dir + `CONSTANT` export | `FileEditTool/`, `FILE_EDIT_TOOL_NAME` |
| Import paths | `.js` extension (ESM) | `from './utils/advisor.js'` |

### TypeScript Patterns

- **Immutable state**: Use `DeepImmutable<>` wrapper for app state; updates via immutable spread `{ ...prev, field: newValue }`
- **Branded types** prevent ID mix-ups: `SessionId`, `AgentId`
- **Zod schemas** for runtime validation; use `lazySchema()` to break circular refs
- **One type → one file** to prevent circular imports; leaf modules export constants
- **Feature gates** via `import { feature } from 'bun:bundle'` — dead-code eliminated at build time

### React/Ink Patterns

- Props type exported alongside the component
- Default function export for components
- `useAppState(s => s.field)` selectors to prevent unnecessary re-renders
- Ink primitives: `Box` (layout), `Text` (styled text), `Ansi` (escape handling)
- `useTheme()` for light/dark mode colors

## Architecture Decisions

### Command System — Three Archetypes

1. **PromptCommand**: Sends context to Claude (has `getPromptForCommand`, `allowedTools`, `context: 'inline' | 'fork'`)
2. **LocalCommand**: Synchronous CLI ops (has `load()` returning `{ call }`)
3. **LocalJSXCommand**: Interactive React/Ink UI (has `load()` returning JSX-based `{ call }`)

All commands use **lazy loading** — dependencies deferred until invocation.

### Feature Gates

```typescript
if (feature('VOICE_MODE')) { /* eliminated at build if disabled */ }
```

Use `feature()` from `bun:bundle` for compile-time gating. Feature-gated tools and tasks return `null` when disabled.

### Settings Precedence (lowest → highest)

`userSettings` → `projectSettings` → `localSettings` → `flagSettings` → `policySettings`

### Permission Rule Matcher Syntax

```
"Bash(git *)"              // Bash with git commands only
"Read(*.py)"               // File reads of Python files only
"Edit(!node_modules/**)"   // Edit anything except node_modules
```

### Skills System

Skills can be **bundled** (shipped), **filesystem-based** (loaded from disk), or **MCP-powered**. Each has a `context` mode:
- `'inline'`: expands into current conversation
- `'fork'`: spawns sub-agent with separate budget

## Build and Test

- **Runtime**: Bun
- **Linter**: Biome (primary), ESLint (secondary — `@typescript-eslint` rules)
- **No embedded tests**: Testing happens externally; focus on runtime correctness
- **Node requirement**: `>=18.0.0`

```bash
npm install
npm run build
npm run lint
```

## Pitfalls

- **Import order matters**: Side-effect imports are carefully ordered for startup parallelization — don't reorder imports in `main.tsx` or `setup.ts`
- **Circular dependencies**: Resolved via leaf modules and `lazySchema()` — when adding new types, keep them in dedicated files under `types/`
- **Feature-gated code**: Always check for `null` returns from feature-gated tools/tasks before use
- **`.js` extensions required**: All relative imports must use `.js` extension (ESM convention)
- **React 19 compiler markers**: `_c()` calls in components are auto-injected optimization metadata — don't modify manually
