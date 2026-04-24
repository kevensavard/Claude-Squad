# Squad — collaborative vibecoding platform

## What this is

Squad is a real-time multiplayer development platform. Multiple users share a group chat room where they can brainstorm together and tag their individual Claude Code agents. When ready, agents coordinate autonomously to build a shared codebase in parallel — each agent owning a distinct slice of the filesystem, with token costs split across all participants.

## Read these docs before touching any code

Every system has its own spec. Read the relevant one before implementing anything in that system. Do not guess at design decisions — they are all documented.

| System | Doc |
|--------|-----|
| Full architecture overview | `docs/ARCHITECTURE.md` |
| Session State Server | `docs/systems/SESSION_STATE_SERVER.md` |
| Agent hook system (file ownership) | `docs/systems/AGENT_HOOKS.md` |
| Group chat + @mention routing | `docs/systems/GROUP_CHAT.md` |
| Orchestrator agent logic | `docs/systems/ORCHESTRATOR.md` |
| Git + branch strategy | `docs/systems/GIT_STRATEGY.md` |
| Token metering | `docs/systems/TOKEN_METERING.md` |
| API contracts format | `docs/contracts/API_CONTRACTS.md` |
| Shared types convention | `docs/contracts/SHARED_TYPES.md` |
| Build phases + acceptance criteria | `docs/phases/BUILD_PHASES.md` |
| Environment variables | `docs/ENV.md` |
| Database schema + migrations (SQL) | `docs/DATABASE.md` |
| UI components + design system | `docs/UI_COMPONENTS.md` |
| API routes (all endpoints) | `docs/API_ROUTES.md` |
| Error handling + resilience | `docs/ERROR_HANDLING.md` |
| Monorepo setup + tooling | `docs/MONOREPO.md` |

## Tech stack (non-negotiable)

- **Framework:** Next.js 15 (App Router, server actions, API routes)
- **Database + auth + realtime:** Supabase (Postgres, Supabase Realtime for group chat)
- **Session State Server:** Partykit (WebSocket room server, one room per squad session)
- **Agent SDK:** `@anthropic-ai/claude-code` — SDK mode only, never CLI subprocess
- **Intent classifier:** Claude Haiku via direct Anthropic API (fast, cheap, pre-execution)
- **Orchestrator:** Claude Sonnet via direct Anthropic API (planning + decomposition)
- **Git operations:** Octokit (`@octokit/rest`) against GitHub API
- **Isolated execution:** Claude Code SDK built-in sandbox mode (not E2B)
- **Styling:** Tailwind CSS v4
- **Deployment:** Vercel (Next.js) + Partykit cloud

## Absolute rules — read every time

1. **Never start a build task without reading the relevant system doc first.**
2. **Never write to a file you do not own.** Ownership is enforced by hooks — but also respect it in your reasoning. If a task requires touching a SHARED-RO file, post a dependency request instead.
3. **Never dispatch build tasks without a human Approve action.** Plan mode produces a proposal. Build mode only starts after an explicit button click logged in the decision log.
4. **The Session State Server is the single source of truth.** Never derive shared state from local inference. Always read from SSS, always write to SSS.
5. **Every API route must be typed end-to-end.** No `any`. Use the shared types from `src/types/shared.ts`.
6. **Test each phase completely before moving to the next.** See `docs/phases/BUILD_PHASES.md` for acceptance criteria per phase.
7. **The Partykit server and Next.js app are two separate deployable units.** Keep them in separate directories: `apps/web` (Next.js) and `apps/party` (Partykit).

## Repo structure

```
squad/
  apps/
    web/          ← Next.js 15 app
    party/        ← Partykit session state server
  packages/
    types/        ← Shared TypeScript types (consumed by both apps)
    agent-runner/ ← Claude Code SDK wrapper + hook enforcement
  docs/           ← All spec docs (this tree)
  CLAUDE.md       ← This file
```

## When you are blocked

If you hit a decision not covered by the docs, do the following in order:
1. Check if a related system doc covers it by implication.
2. Write your assumption as a comment in the code with `// ASSUMPTION:` prefix.
3. Continue — do not stop and ask. Assumptions get reviewed at phase acceptance.
