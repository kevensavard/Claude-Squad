# Architecture overview

## The four layers

```
┌─────────────────────────────────────────────┐
│  L1 — Users (browsers)                       │
│  Each user has a browser tab open to         │
│  the Squad web app.                          │
└──────────────────┬──────────────────────────┘
                   │ WebSocket (Supabase Realtime)
┌──────────────────▼──────────────────────────┐
│  L2 — Group chat (Next.js + Supabase)        │
│  Shared room. Messages, @mentions,           │
│  artifact cards, approve buttons.            │
└──────────────────┬──────────────────────────┘
                   │ WebSocket (Partykit)
┌──────────────────▼──────────────────────────┐
│  L3 — Session State Server (Partykit)        │
│  Source of truth for: agent registry,        │
│  file ownership, task queue, API contracts,  │
│  decision log, token meters.                 │
└──────────────────┬──────────────────────────┘
                   │ Agent SDK calls
┌──────────────────▼──────────────────────────┐
│  L4 — Agent execution (Claude Code SDK)      │
│  One SDK instance per agent. Each runs in    │
│  its own sandbox with PreToolUse hooks.      │
│  Writes go to per-agent Git branches.        │
└─────────────────────────────────────────────┘
```

## Data flow: @agent mention → response

```
User types "@claude-1 plan this out"
  │
  ▼
Supabase message insert (group chat)
  │
  ▼
Next.js API route /api/mention
  │
  ├─ Haiku intent classification (200ms)
  │   → {mode: "plan", confidence: 0.97}
  │
  ├─ SSS read: fetch session context snapshot
  │   → last 30 messages, spec, agent statuses
  │
  ├─ Build system prompt for target agent
  │
  └─ Route by mode:
      ├─ brainstorm/review → Claude API direct (streaming)
      ├─ plan → Claude API direct → renders as ProposalCard
      └─ build → requires Approve action first
           │
           ▼
        Orchestrator decomposes → task graph → SSS write
           │
           ▼
        Per-agent: spawn SDK, inject context, run with hooks
           │
           ▼
        Status updates → SSS → broadcast → group chat
```

## Data flow: agent writes a file

```
Agent (Claude Code SDK) calls Write tool
  │
  ▼
PreToolUse hook fires (before disk write)
  │
  ├─ Hook reads file path from tool params
  ├─ Hook calls SSS: GET /ownership/{path}
  │
  ├─ If owned by this agent → return {} (allow)
  ├─ If SHARED-RO → return {decision: "block", reason: "..."}
  ├─ If owned by other agent → return {decision: "block", reason: "..."}
  └─ If unowned → return {decision: "block", reason: "not in your task scope"}
       (all ownership pre-assigned at decomposition time)
```

## Data flow: build completes → merge

```
All agents post DONE to SSS task queue
  │
  ▼
Orchestrator receives TaskCompletedHookInput for last task
  │
  ▼
Orchestrator runs merge sequence:
  1. Pull each agent branch via GitHub API
  2. Run conflict check (should be zero — ownership prevented them)
  3. If conflicts: surface in group chat, pause, request human review
  4. If clean: create PR or push to main
  5. Post summary card to group chat with diff stats + link
```

## Key system boundaries

| Boundary | Protocol | Who initiates |
|----------|----------|---------------|
| Browser ↔ Group chat | Supabase Realtime (WebSocket) | Browser subscribes |
| Next.js API ↔ SSS | Partykit WebSocket + HTTP | Next.js API routes |
| Next.js API ↔ Claude API | HTTPS (Anthropic SDK) | Next.js API routes |
| Agent runner ↔ SSS | HTTP (ownership checks in hooks) | Agent hooks |
| Agent runner ↔ GitHub | HTTPS (Octokit) | Orchestrator |
| Agent runner ↔ filesystem | SDK sandbox (intercepted) | Claude Code SDK |

## What lives where

### `apps/web` (Next.js)
- All UI: group chat, presence, artifact cards, approve buttons
- API routes: `/api/mention`, `/api/session`, `/api/approve`, `/api/merge`
- Supabase client (realtime subscriptions, auth)
- Partykit client (reads SSS state for UI rendering)

### `apps/party` (Partykit)
- Single `server.ts` — the Session State Server
- Stores all session state in Partykit's built-in durable storage
- Exposes HTTP endpoints for agent hooks to call synchronously
- Broadcasts state changes to all connected clients via WebSocket

### `packages/types`
- All shared TypeScript types consumed by both apps and agent runner
- `Session`, `Agent`, `Task`, `FileOwnership`, `ApiContract`, `ChatMessage`
- Never contains logic — types only

### `packages/agent-runner`
- Wraps Claude Code SDK
- Builds context injections from SSS state
- Registers PreToolUse hooks for ownership enforcement
- Streams agent output back to group chat via SSS broadcast
- Handles DONE/BLOCKED/HANDOFF state transitions

## State that lives in Supabase (persistent, queryable)

- `sessions` table: id, host_user_id, github_repo_url, created_at, status
- `session_members` table: session_id, user_id, agent_id, joined_at
- `messages` table: session_id, user_id, agent_id, content, mode, created_at
- `token_usage` table: session_id, user_id, tokens_in, tokens_out, model, created_at

## State that lives in Partykit (ephemeral, fast)

- Agent registry (who is online, heartbeat timestamps)
- File ownership map (path → agent_id)
- Task queue (pending, in_progress, done, blocked tasks)
- API contracts (published interfaces between agent work zones)
- Decision log (last 20 decisions, summarized)
- Token meter per user (running total for current session)

Partykit state resets when a session ends. Durable records (token usage, messages) are written to Supabase before session close.
