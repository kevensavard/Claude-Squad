# Phase 6 — Claude Code MCP Integration Design

**Goal:** Let any session participant connect their local Claude Code as their agent (orchestrator or worker) by copying one command from the session UI — no API key required.

**Architecture:** Squad-skill adds a `connect` command that detects Claude Code, registers itself as an MCP server, and launches Claude Code with squad tools pre-loaded. The existing API key flow is unchanged and remains the fallback.

**Tech Stack:** `@modelcontextprotocol/sdk`, `@squad/skill`, Next.js ConnectionModal, Partykit SSS, Claude Code CLI

---

## Connection Flow

```
User clicks "Connect" in session UI
  └─ ConnectionModal shows two tabs: [API Key] [Claude Code]

Claude Code tab shows:
  1. Install Claude Code if needed (link to claude.ai/code)
  2. Copy command:
       npx @squad/skill connect \
         --session <sessionId> \
         --agent <agentId> \
         --role <orchestrator|agent>
  3. "Waiting for connection..." spinner (polls SSS for agent presence)
  └─ Modal closes automatically once agent registers on WebSocket

User pastes command in terminal:
  └─ Detects `claude` in PATH
       └─ Found:
            1. claude mcp add claude-squad-<sessionId> -- npx @squad/skill mcp \
                 --session <sessionId> --agent <agentId> --role <role>
            2. claude (launches Claude Code with squad MCP tools)
       └─ Not found → falls back to existing interactive API key prompt
```

---

## Role Assignment

The role (`orchestrator` | `agent`) is determined server-side based on who created the session (stored in Supabase `sessions` table). The session UI reads the role and embeds it in the generated command. Users never choose their role manually.

- **Session creator** → `--role orchestrator`
- **All other participants** → `--role agent`

---

## File Structure — packages/squad-skill/src/

```
index.ts            ← adds --connect flag; routes to connectViaClaude or existing flow
connect.ts          ← existing API key + guided mode (unchanged)
detect-claude.ts    ← NEW: claude --version check, claude mcp add, claude launch
mcp-server.ts       ← NEW: stdio MCP server; holds Partykit WebSocket
mcp-tools/
  shared.ts         ← NEW: get_session_state, post_message (both roles)
  orchestrator.ts   ← NEW: watch_session, dispatch_tasks, get_pending_approvals
  agent.ts          ← NEW: get_assigned_tasks, claim_task, mark_task_done
prompt.ts           ← unchanged
errors.ts           ← unchanged
```

---

## MCP Tools

### Shared (orchestrator + agent)

**`get_session_state`**
Returns current session snapshot: connected agents and their roles/status, recent messages (last 20), active tasks and their assignees, token usage per agent.

**`post_message`**
Posts a message to the group chat as this agent. Parameters: `content: string`.

---

### Orchestrator only

**`watch_session`**
Long-polls the Partykit WebSocket for events that need orchestrator attention. Returns one of:
- `{ type: 'mention', from: string, content: string, requestId: string }` — someone @mentioned the orchestrator
- `{ type: 'build_goal', from: string, content: string }` — someone described something to build
- `{ type: 'approval_needed', proposalId: string, agentId: string, summary: string }` — agent proposal waiting for sign-off

Times out after 30s and returns `{ type: 'idle' }` so Claude Code loops back.

**`dispatch_tasks`**
Sends a task graph to the SSS which broadcasts it to connected agents. Parameters:
```typescript
{
  tasks: Array<{
    id: string
    title: string
    description: string
    assignedAgentId: string   // must match a connected agent's ID
    dependsOn?: string[]      // task IDs that must complete first
  }>
}
```

**`get_pending_approvals`**
Returns all agent proposals currently waiting for orchestrator approval. Each includes `proposalId`, `agentId`, `summary`, `branchName`, `prUrl` (if available).

---

### Agent only

**`get_assigned_tasks`**
Returns tasks assigned to this agent that are pending or in-progress.

**`claim_task`**
Claims a task and marks it in-progress on the SSS. Parameters: `taskId: string`.

**`mark_task_done`**
Marks a task complete and posts a proposal to the group chat. Parameters: `taskId: string`, `summary: string`, `branchName?: string`, `prUrl?: string`.

---

## Orchestrator System Prompt

Injected automatically when `claude` launches via the `connect` command:

```
You are the orchestrator AND a participant in a Claude Squad session.
Session: <sessionId> | Your agent ID: <agentId>

Your two responsibilities — in priority order:

1. RESPOND TO @MENTIONS — questions, brainstorming, feedback, code review.
   When watch_session() returns type: 'mention', respond conversationally
   via post_message(). This always takes priority over build work.

2. ORCHESTRATE BUILDS — when watch_session() returns type: 'build_goal',
   call get_session_state() to see connected agents, then dispatch_tasks()
   with a parallel task graph. Assign each task to a specific agent.

Additional:
- Call get_pending_approvals() after each watch_session() loop to catch
  proposals that need your sign-off.
- Stay silent during casual conversation — only post_message() when
  directly relevant.
- Call watch_session() in a loop continuously.
```

---

## SSS Changes (apps/party)

### register_agent message — add role field

```typescript
// Before
{ type: 'register_agent', agentId, userId, displayName }

// After
{ type: 'register_agent', agentId, userId, displayName, role: 'orchestrator' | 'agent' }
```

SSS stores the role in room state and includes it in session state broadcasts. Only one orchestrator allowed per session — if a second tries to register as orchestrator, SSS sends back an error message.

### New message type: orchestrator_dispatch

Sent by orchestrator → SSS broadcasts to all agents:
```typescript
{
  type: 'orchestrator_dispatch',
  taskGraph: Task[]
}
```

SSS forwards this to all connected agent WebSockets as `build_started` (existing message type that agent-runner already handles).

### New message type: route_to_orchestrator

When an @mention targets the orchestrator's agentId, SSS routes it via the existing `route_to_agent` mechanism (same path as regular agent routing today). No new SSS code needed for this — agentId matching handles it.

---

## packages/types — New Types

```typescript
// register_agent role field
type AgentRole = 'orchestrator' | 'agent'

// watch_session return events
type WatchEvent =
  | { type: 'mention'; from: string; content: string; requestId: string }
  | { type: 'build_goal'; from: string; content: string }
  | { type: 'approval_needed'; proposalId: string; agentId: string; summary: string }
  | { type: 'idle' }

// orchestrator_dispatch (new ClientMessage)
type OrchestratorDispatch = {
  type: 'orchestrator_dispatch'
  taskGraph: Task[]
}
```

---

## apps/web — ConnectionModal Changes

The existing `ConnectionModal` (`apps/web/src/components/onboarding/ConnectionModal.tsx`) gets a second tab.

**Tab 1: API Key** — existing content, unchanged.

**Tab 2: Claude Code**
- Step 1: "Install Claude Code" link (claude.ai/code) — shown dimmed if already installed (detected via user-agent or just always shown as a reminder)
- Step 2: Copy command block — shows the generated `npx @squad/skill connect ...` command with a copy button
- Step 3: "Waiting for connection…" spinner — subscribes to Partykit room presence via the existing `usePartykitSession` hook, closes modal when this agent's ID appears in the presence map

The command is generated from:
- `sessionId` — from session context
- `agentId` — from user's existing agent ID (already stored in Supabase)
- `role` — fetched from `sessions` table (`created_by === user.id` → orchestrator, else agent)

---

## Presence Sidebar Changes

The orchestrator agent gets a distinct visual indicator in the sidebar (e.g. crown icon or "Orchestrator" label) so all participants can see who is managing the session.

When the orchestrator disconnects, the sidebar shows "Orchestrator offline — build dispatch paused" and new task dispatches are disabled until they reconnect. Existing in-progress tasks continue.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Claude Code not in PATH | Falls back to interactive API key prompt |
| Second orchestrator tries to connect | SSS rejects with error message in terminal |
| Orchestrator disconnects mid-session | SSS marks orchestrator offline; agents finish claimed tasks; new dispatch paused; sidebar shows warning |
| MCP server crashes | Claude Code loses squad tools; user sees MCP error; re-run connect command to reconnect |
| Partykit WebSocket drops | MCP server reconnects with exponential backoff (1s, 2s, 4s, max 30s) |

---

## What Does Not Change

- Existing `npx @squad/skill --key sk-ant-xxx` flow — fully preserved
- `packages/agent-runner` — unchanged (used by API key flow, not MCP flow)
- All Partykit SSS message handling except the two additions above
- All web app routes and API handlers
- Supabase schema
