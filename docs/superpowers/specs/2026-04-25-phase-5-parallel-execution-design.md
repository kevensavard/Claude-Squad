# Phase 5 — Parallel Agent Execution Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Enable multiple agents to work on their assigned tasks simultaneously, enforce `dependsOn` gates, and reassign tasks when an agent disconnects.

---

## Problem

Agents currently run tasks sequentially: `connect.ts` iterates `myTasks` with a `for await` loop, so even if two tasks are independent, the second doesn't start until the first finishes. The `dependsOn` field in `Task` exists but is never checked.

---

## Goals

1. Agents start all their assigned independent tasks concurrently.
2. A task with `dependsOn` waits until every listed task ID is `done` before starting.
3. If an agent disconnects mid-build, its in-progress tasks are reset and re-broadcast so another agent can claim them.

## Non-Goals

- Dynamic task assignment at dispatch time (tasks remain pre-assigned by the orchestrator at approval).
- One agent running tasks assigned to a different agent (except orphaned reassignment).
- Parallelism within a single `runAgent` call.

---

## Architecture

### 1. Concurrent task launch (`connect.ts`)

Replace the sequential loop with a dependency-aware concurrent launcher:

```ts
await Promise.all(myTasks.map(task => runTaskWhenReady(task, ws, sessionTaskState)))
```

`runTaskWhenReady(task, ws, taskState)`:
- If `task.dependsOn` is empty → call `runAgent(task)` immediately.
- Otherwise → await `waitForDependencies(task.dependsOn, taskState)`, then call `runAgent(task)`.

`waitForDependencies(depIds, taskState)` returns a Promise that resolves when all `depIds` appear as `done` in `taskState`. `taskState` is a shared in-memory map updated by listening to `task_done` broadcasts on the existing WebSocket connection.

No polling. The SSS broadcasts `task_done` to all connected agents; the gate resolves on the incoming message.

### 2. `task_done` broadcast (SSS `server.ts`)

When `applyClientMessage` processes a `task_done` message, the SSS currently updates state but does not broadcast to other agents. Add an explicit broadcast:

```ts
room.broadcast(JSON.stringify({ type: 'task_done', taskId: msg.taskId, agentId: msg.agentId }))
```

This is the signal dependency gates listen for.

### 3. Heartbeat expiry + task reassignment (SSS `checkHeartbeats`)

Extend `checkHeartbeats` (already runs on interval):

1. For each agent where `Date.now() - lastHeartbeat > 60_000`:
   - Mark agent status `offline`.
   - Find any tasks with `status: 'in_progress'` and `assignedAgentId === agent.agentId`.
   - Reset each to `status: 'pending'`, `assignedAgentId: null`.
   - Broadcast `task_available: { taskId, originalAgentId }` to all connected agents.

2. On `connect.ts` side: each agent listens for `task_available`. If `originalAgentId` matches the local `agentId`, the agent claims and runs the orphaned task immediately (it already has the context and workdir).

The 60s threshold matches the existing 30s heartbeat interval — two missed beats before expiry.

### 4. Type changes (`@squad/types`)

**No type changes.** The design preserves backward compatibility:

- `Task.assignedAgentId` stays `string` — original assignment is never cleared. Orphaned tasks keep their original `assignedAgentId`, which the reclaim logic uses to match agents when re-broadcasting.
- No new ServerMessage types — existing `task_update` (already in SSS) is reused. When a task status is `pending` and was previously `in_progress`, agents check if the task's `assignedAgentId === agentId` to recognize it as their own orphaned task and reclaim it.
- All other fields (`dependsOn`, task statuses, `AgentRecord`) already exist.

This approach keeps the schema immutable across sessions while enabling reclaim matching without additional type definitions.

---

## Data Flow

```
Orchestrator approves plan
  → SSS stores TaskQueue (pre-assigned)
  → SSS broadcasts build_started { taskGraph }

Each agent (connect.ts):
  myTasks = taskGraph.filter(t => t.assignedAgentId === agentId)
  Promise.all(myTasks.map(runTaskWhenReady))
    ├─ independent tasks → runAgent() immediately
    └─ dependent tasks   → wait for task_done broadcasts → runAgent()

Agent finishes task:
  → runAgent sends task_done to SSS
  → SSS updates state + broadcasts task_done to all agents
  → Dependent task gates resolve in other agents

Agent disconnects:
  → SSS checkHeartbeats detects stale (>60s)
  → Resets in_progress tasks → pending, assignedAgentId = null
  → Broadcasts task_available { taskId, originalAgentId }
  → Matching agent (if still connected) claims + runs orphaned task
```

---

## Files Changed

| File | Change |
|---|---|
| `packages/types/src/sss.ts` | Add `task_done` + `task_available` to `ServerMessage`; `Task.assignedAgentId: string \| null` |
| `apps/party/src/server.ts` | Broadcast `task_done` after state update; extend `checkHeartbeats` for expiry + `task_available` |
| `packages/squad-skill/src/connect.ts` | Replace sequential loop with `Promise.all` + `runTaskWhenReady` + `waitForDependencies` + orphan listener |

`packages/agent-runner` — no changes. Each `runAgent` call is already self-contained.

---

## Error Handling

- If a dependency task ends in `aborted` (not `done`), the waiting task is also aborted and broadcasts an error message to chat.
- If `runAgent` throws, the error is caught per-task; other concurrent tasks continue.
- Orphaned task reassignment is best-effort: if no agent claims within the session lifetime, the task remains `pending` and is reported in the session summary.

---

## Testing

- Unit: `waitForDependencies` resolves when all dep IDs arrive as `task_done` events.
- Unit: `checkHeartbeats` resets stale agent tasks and emits `task_available`.
- Integration (manual smoke test): two agents connected, 3 tasks (task 2 depends on task 1, task 3 is independent) — verify task 3 and task 1 start immediately, task 2 starts only after task 1 done.
- Disconnect test: kill one agent mid-build, verify SSS resets task and surviving agent claims it.
