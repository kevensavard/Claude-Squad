# Build phases

Build Squad in this exact order. Complete each phase fully and verify all acceptance criteria before moving to the next. Do not start Phase N+1 while Phase N has failing criteria.

---

## Phase 1 — Monorepo scaffold + Session State Server

**Goal:** Partykit SSS running locally, accepting WebSocket connections, persisting state.

### Tasks
1. Initialize Turborepo monorepo with `apps/web`, `apps/party`, `packages/types`, `packages/agent-runner`
2. Set up `packages/types` — export all types from `docs/systems/SESSION_STATE_SERVER.md`
3. Implement `apps/party/src/server.ts` — full SSS per spec in `SESSION_STATE_SERVER.md`
4. Write SSS unit tests (Vitest): session CRUD, agent registration, heartbeat expiry, ownership operations
5. Set up local `.env` files (see `docs/ENV.md`)

### Acceptance criteria
- [ ] `pnpm dev` starts both apps without errors
- [ ] Partykit server accepts a WebSocket connection and returns session state on connect
- [ ] `POST /parties/main/{id}/ownership` stores an entry; `GET` retrieves it correctly
- [ ] `GET /parties/main/{id}/context-injection/{agentId}` returns a valid context string under 3,800 tokens
- [ ] Heartbeat expiry test: agent marked offline after 90s of no heartbeat (use fake timers)
- [ ] All SSS unit tests pass

---

## Phase 2 — Group chat UI + Supabase Realtime

**Goal:** Multiple browser tabs can join a session and exchange messages in real time.

### Tasks
1. Set up Supabase project. Run migrations for all tables in `GROUP_CHAT.md`
2. Set up Next.js app with Supabase auth (email + OAuth with GitHub)
3. Build session creation flow: host creates session, gets invite link
4. Build session join flow: user opens invite link, authenticated, added to `session_members`
5. Build group chat UI: message list, input box, presence sidebar
6. Wire up Supabase Realtime — messages appear in all tabs on insert
7. Implement @mention parsing (client-side, before send)

### Acceptance criteria
- [ ] Two browser tabs can join the same session
- [ ] Message sent in Tab A appears in Tab B within 500ms
- [ ] Presence sidebar shows both users as online
- [ ] @mention text is highlighted in the input box before sending
- [ ] Messages persist across page reload (loaded from Supabase on mount)
- [ ] Auth works: unauthenticated users are redirected to login

---

## Phase 3 — Intent classification + agent responses (no code execution)

**Goal:** @agent mentions trigger Claude API responses streamed into the group chat. Brainstorm, review, and plan modes all work.

### Tasks
1. Build `/api/mention` API route — receives message, classifies intent, routes by mode
2. Implement Haiku intent classifier per `GROUP_CHAT.md`
3. Implement brainstorm mode: Claude Sonnet streaming response → Supabase message insert
4. Implement review mode: same as brainstorm but with artifact extraction from message
5. Implement plan mode: orchestrator decomposes spec → ProposalCard inserted as message with metadata
6. Build ProposalCard UI component — renders task list with estimated tokens, Approve/Modify buttons
7. Wire Partykit client in UI — connect to SSS room, display agent status in presence sidebar

### Acceptance criteria
- [ ] `@claude-1 what do you think about using Postgres vs MongoDB?` → streaming text response in chat
- [ ] `@claude-1 review this code: [code block]` → structured review card in chat
- [ ] `@claude-1 plan this out` → ProposalCard renders in chat with task list and token estimates
- [ ] Haiku classification returns in < 400ms (measured at the API route)
- [ ] Confidence < 0.70 always falls back to brainstorm (test with ambiguous messages)
- [ ] Agent response appears with correct agent name and color in the UI
- [ ] @all sends to each agent in sequence, each capped at 200 tokens

---

## Phase 4 — Single-agent build execution

**Goal:** One agent can execute a build task end-to-end: accept a task, write files, push to GitHub, mark done.

### Tasks
1. Implement `packages/agent-runner/src/runner.ts` — full SDK invocation per `AGENT_HOOKS.md`
2. Implement all four hooks: ownership enforcement, bash safety, status broadcast, task completion
3. Implement `PublishApiContract` and `RequestSharedWrite` custom tools
4. Build `/api/approve` route — validates approval, writes tasks to SSS, spawns agent runner
5. Set up GitHub OAuth + Octokit client — create repo, create branch, push commits
6. Build sandbox environment — confirm Claude Code SDK sandbox mode works in Vercel serverless context (if not, use Docker via E2B as fallback)
7. Test with a real simple task: "Create a Hello World Express server in src/server.ts"

### Acceptance criteria
- [ ] Clicking Approve in a ProposalCard starts the build (confirmed by system message)
- [ ] Agent status changes to `building` in the presence sidebar
- [ ] Agent posts status messages to group chat as it writes files ("Wrote src/server.ts")
- [ ] A write attempt to a non-owned file is blocked — error appears in agent's output, not silently swallowed
- [ ] Task completes: branch exists in GitHub with the committed files
- [ ] Task marked `done` in SSS task queue
- [ ] Token count updated in SSS and Supabase

---

## Phase 5 — Multi-agent parallel execution

**Goal:** All agents work simultaneously on their tasks. No conflicts. Orchestrator monitors and handles blockers.

### Tasks
1. Extend `dispatchBuild` to spawn N agent runners in parallel (per `ORCHESTRATOR.md`)
2. Implement orchestrator progress monitoring — listens to SSS broadcasts
3. Implement blocker handling — surface BLOCKED tasks in group chat with context
4. Implement offline agent handling — heartbeat loss, task release, reassignment UI
5. Test with a 2-agent scenario: agent 1 builds auth, agent 2 builds a frontend page that uses the auth API
6. Test shared write flow: agent 2 requests a new shared type, orchestrator applies it, agent 2 continues

### Acceptance criteria
- [ ] 2 agents run simultaneously, each owning different file paths
- [ ] Neither agent can write files owned by the other (verified by intentionally attempting a cross-ownership write in a test)
- [ ] Contract publish by agent 1 appears in group chat and in agent 2's next context injection
- [ ] Shared write request is batched and applied within 5s
- [ ] Simulated agent offline: tasks released, group chat notified, tasks reassignable
- [ ] Both agents complete their tasks and branches exist in GitHub

---

## Phase 6 — Merge sequence + session summary

**Goal:** When all tasks are done, orchestrator merges branches, creates a PR, and posts a summary.

### Tasks
1. Implement merge sequence per `ORCHESTRATOR.md`
2. Build merge conflict UI — if conflicts, show them in group chat with file paths
3. Build build summary card UI — PR link, stats, per-user token breakdown
4. Flush final token usage to Supabase on session close
5. Build session summary page (accessible after session ends)

### Acceptance criteria
- [ ] After all agents post DONE, merge sequence runs automatically
- [ ] A PR exists in GitHub with all agents' work combined
- [ ] Build summary card appears in group chat with correct stats
- [ ] Token breakdown per user is accurate (verify against Supabase token_usage table)
- [ ] Session summary page shows full history and final token costs

---

## Phase 7 — Polish, error handling, edge cases

**Goal:** The product is robust enough for a real session with real users.

### Tasks
1. Error boundaries in UI — no white screens on agent failures
2. Reconnection handling — if a user's tab loses WebSocket, it reconnects and rehydrates state
3. Rate limit handling — if Claude API returns 429, back off and retry with exponential backoff, surface to group chat
4. Context overflow handling — if an agent's context approaches the limit, the SDK auto-compacts; ensure the context injection is still injected after compaction via system prompt (not chat history)
5. Session replay — a new user joining an in-progress session sees a summary of what's happened so far
6. Mobile-responsive group chat UI
7. Deploy to Vercel + Partykit cloud, test with real multi-user session

### Acceptance criteria
- [ ] Disconnecting and reconnecting a browser tab restores full state within 2s
- [ ] A 429 from Claude API results in a retry message in chat, not a crash
- [ ] New user joining mid-session sees a "Session started X minutes ago. Here's what's happened:" summary
- [ ] UI is usable on a 375px wide mobile screen
- [ ] End-to-end test: 2 users on different machines build a simple app together from brainstorm to PR
