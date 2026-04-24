# Session State Server (SSS)

The SSS is a Partykit server (`apps/party/src/server.ts`). It is the single source of truth for all live session state. Every agent, every UI client, and every Next.js API route reads from and writes to it.

## Why Partykit

- Built-in durable WebSocket rooms — one room per squad session, identified by session ID
- Built-in durable storage (key-value, survives restarts)
- HTTP endpoints on the same process — agents call these synchronously in hooks (low latency critical)
- Broadcasts to all connected clients automatically
- Deploys independently of Next.js

## Room lifecycle

One Partykit room = one squad session. Room ID = squad session UUID.

```
Host creates session
  → Next.js creates Supabase session record
  → Partykit room is initialized (lazy, on first connection)
  → Host's browser connects to room
  → Other users join via invite link → connect to same room

Session ends (host closes, or all users disconnect for >10min)
  → SSS flushes token usage + decision log to Supabase
  → Room hibernates
```

## Storage schema

All stored as JSON in Partykit's built-in storage.

```typescript
// Key: "session"
interface SessionState {
  id: string
  hostUserId: string
  projectBrief: string          // set by host at session start
  agreedSpec: string            // updated as group chat converges
  decisionLog: DecisionEntry[]  // last 20 decisions, older ones summarized
  apiContracts: Record<string, ApiContract>  // routeKey → contract
  sharedTypesSnapshot: string   // stringified src/types/shared.ts contents
  status: 'lobby' | 'planning' | 'building' | 'done'
  createdAt: string
}

// Key: "agents"
interface AgentRegistry {
  [agentId: string]: AgentRecord
}

interface AgentRecord {
  agentId: string
  userId: string
  displayName: string           // "Claude (Keven)"
  status: 'idle' | 'brainstorming' | 'planning' | 'building' | 'blocked' | 'done' | 'offline'
  currentTaskId: string | null
  lastHeartbeat: number         // unix ms
  tokensUsed: number            // session total for this agent's owner
}

// Key: "tasks"
interface TaskQueue {
  [taskId: string]: Task
}

interface Task {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  assignedAgentId: string
  status: 'pending' | 'in_progress' | 'blocked' | 'done' | 'aborted'
  fileOwnership: string[]       // glob patterns this task owns
  dependsOn: string[]           // task IDs that must be done first
  blockedReason?: string
  estimatedTokens: number
  actualTokens?: number
  createdAt: string
  startedAt?: string
  completedAt?: string
}

// Key: "ownership"
interface OwnershipMap {
  [normalizedPath: string]: {
    agentId: string
    tier: 'owned' | 'shared-ro'
    taskId: string
  }
}

// Key: "contracts"
interface ContractRegistry {
  [routeKey: string]: ApiContract  // e.g. "POST /api/auth/login"
}

interface ApiContract {
  method: string
  path: string
  publishedByAgentId: string
  requestSchema: object           // JSON Schema
  responseSchema: object          // JSON Schema
  publishedAt: string
}

// Key: "meters"
interface TokenMeters {
  [userId: string]: {
    tokensIn: number
    tokensOut: number
    lastUpdated: string
  }
}
```

## WebSocket message types (server → clients)

All messages are JSON with a `type` field.

```typescript
type ServerMessage =
  | { type: 'session_state'; payload: SessionState }
  | { type: 'agent_update'; payload: AgentRecord }
  | { type: 'task_update'; payload: Task }
  | { type: 'ownership_update'; payload: OwnershipMap }
  | { type: 'contract_published'; payload: ApiContract }
  | { type: 'agent_message'; agentId: string; content: string; mode: AgentMode }
  | { type: 'build_started'; taskGraph: Task[] }
  | { type: 'build_complete'; summary: BuildSummary }
  | { type: 'agent_blocked'; agentId: string; taskId: string; reason: string }
  | { type: 'heartbeat_lost'; agentId: string }
```

## WebSocket message types (clients → server)

```typescript
type ClientMessage =
  | { type: 'register_agent'; agentId: string; userId: string; displayName: string }
  | { type: 'heartbeat'; agentId: string }
  | { type: 'update_spec'; spec: string }
  | { type: 'update_status'; agentId: string; status: AgentRecord['status'] }
  | { type: 'task_claim'; agentId: string; taskId: string }
  | { type: 'task_done'; agentId: string; taskId: string; tokensUsed: number }
  | { type: 'task_blocked'; agentId: string; taskId: string; reason: string }
  | { type: 'publish_contract'; contract: ApiContract }
  | { type: 'add_decision'; summary: string; decidedBy: string }
  | { type: 'update_tokens'; userId: string; tokensIn: number; tokensOut: number }
  | { type: 'dispatch_tasks'; tasks: Task[] }  // orchestrator only
  | { type: 'session_close' }
```

## HTTP endpoints (called by agent hooks synchronously)

These are Partykit's HTTP routes on the same server. Low latency — same process as the room.

```
GET  /parties/main/{sessionId}/ownership/{encodedPath}
     → { owned: boolean, agentId: string | null, tier: string }

POST /parties/main/{sessionId}/ownership
     Body: { path: string, agentId: string, taskId: string, tier: 'owned' | 'shared-ro' }
     → { ok: boolean }

DELETE /parties/main/{sessionId}/ownership/{encodedPath}
     → { ok: boolean }

GET  /parties/main/{sessionId}/context-injection/{agentId}
     → ContextInjection (assembled from full session state, trimmed to budget)

POST /parties/main/{sessionId}/token-update
     Body: { userId: string, tokensIn: number, tokensOut: number }
     → { ok: boolean, runningTotal: { tokensIn, tokensOut } }
```

## Heartbeat + offline detection

- Agents send `{ type: 'heartbeat', agentId }` every 30 seconds
- Server checks all heartbeats every 60 seconds
- If `Date.now() - lastHeartbeat > 90_000`:
  - Agent marked `offline`
  - All file ownerships for that agent released (tier set back to `unowned`)
  - `heartbeat_lost` broadcast to all clients
  - Group chat receives a system message: "Claude (Username) went offline. Their tasks have been released."
  - Tasks that were `in_progress` for that agent reset to `pending`

## Context injection assembly

The `/context-injection/{agentId}` endpoint assembles the agent's briefing from session state. Hard budget: 3,800 tokens. Trimming priority (drop from bottom if over budget):

1. Project brief (always included, never trimmed)
2. Assigned task description + acceptance criteria (always included)
3. Agent's owned file patterns (always included)
4. API contracts relevant to this agent's task (filtered by dependency)
5. Other agents' current task status (one-liners only)
6. Agreed spec — most relevant section only (semantic search not available; use first 1,000 chars)
7. Decision log — last 5 entries (older ones already summarized)

Format:
```
## Project
{projectBrief}

## Your task
{task.title}
{task.description}

Acceptance criteria:
{task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

## Files you own
{task.fileOwnership.join('\n')}

## API contracts (what other agents will expose)
{relevantContracts}

## Other agents
{agentStatuses}

## Agreed spec (excerpt)
{specExcerpt}

## Recent decisions
{lastFiveDecisions}
```
