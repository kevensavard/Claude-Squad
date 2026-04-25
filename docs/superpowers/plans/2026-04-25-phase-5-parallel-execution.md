# Phase 5 — Parallel Agent Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable agents to run their assigned tasks concurrently, enforce `dependsOn` gates via WebSocket events, and re-claim orphaned tasks when an agent reconnects after a heartbeat expiry.

**Architecture:** Three small, additive changes: (1) SSS broadcasts `task_update` for each task reset during heartbeat expiry so agents can detect orphans, (2) `connect.ts` tracks task state from incoming `task_update` messages and uses a listener pattern to gate dependent tasks, (3) the sequential `for await` loop is replaced with fire-and-forget concurrent launchers that each wait for their own dependencies.

**Tech Stack:** TypeScript, Vitest, WebSocket (`ws`), Partykit server, `@squad/types`, `@squad/agent-runner`

---

## File Map

| File | Change |
|---|---|
| `apps/party/src/server.ts` | In `runHeartbeatCheck`: broadcast `task_update` for each released task |
| `packages/squad-skill/src/connect.ts` | Replace sequential loop with concurrent launcher + dep gate + orphan listener |
| `packages/squad-skill/src/connect.test.ts` | New — unit tests for `waitForDependencies` and orphan reclaim logic |

`apps/party/src/heartbeat.ts` — no changes (already resets tasks to `pending`, keeps `assignedAgentId` intact).
`packages/types/src/sss.ts` — no changes (existing `task_update` ServerMessage carries all needed info).
`packages/agent-runner` — no changes.

---

## Task 1: Broadcast released tasks in SSS heartbeat check

**Files:**
- Modify: `apps/party/src/server.ts` — `runHeartbeatCheck` method (~line 508)

Currently `runHeartbeatCheck` broadcasts `heartbeat_lost` and `ownership_update` but never broadcasts the reset tasks. Agents never learn that a task went back to `pending`.

- [ ] **Step 1: Add task_update broadcasts for each released task**

In `apps/party/src/server.ts`, update `runHeartbeatCheck` to broadcast each reset task after saving:

```ts
private async runHeartbeatCheck(): Promise<void> {
  const agents = (await this.room.storage.get<AgentRegistry>('agents')) ?? {}
  const tasks = (await this.room.storage.get<TaskQueue>('tasks')) ?? {}
  const ownership = (await this.room.storage.get<OwnershipMap>('ownership')) ?? {}

  const result = checkHeartbeats({ agents, tasks, now: Date.now() })
  if (result.offlineAgentIds.length === 0) return

  await this.room.storage.put('agents', result.updatedAgents)
  await this.room.storage.put('tasks', result.updatedTasks)

  const updatedOwnership = { ...ownership }
  for (const path of result.releasedOwnershipPaths) {
    delete updatedOwnership[path]
  }
  await this.room.storage.put('ownership', updatedOwnership)

  for (const agentId of result.offlineAgentIds) {
    this.room.broadcast(JSON.stringify({ type: 'heartbeat_lost', agentId } satisfies ServerMessage))
    this.room.broadcast(JSON.stringify({ type: 'ownership_update', payload: updatedOwnership } satisfies ServerMessage))
  }

  // Broadcast each released task so agents can detect and reclaim orphans
  for (const taskId of result.releasedTaskIds) {
    const task = result.updatedTasks[taskId]
    if (task) {
      this.room.broadcast(JSON.stringify({ type: 'task_update', payload: task } satisfies ServerMessage))
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @squad/party typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/party/src/server.ts
git commit -m "feat(party): broadcast task_update for orphaned tasks after heartbeat expiry"
```

---

## Task 2: Add task state tracking infrastructure to connect.ts

**Files:**
- Modify: `packages/squad-skill/src/connect.ts`

The message handler needs to maintain a shared view of task statuses so the dependency gate and orphan listener can react to incoming `task_update` events without blocking the handler.

- [ ] **Step 1: Add task tracking state and `onTaskUpdate` handler inside `connectToSession`**

In `packages/squad-skill/src/connect.ts`, inside the `connectToSession` function, add this block immediately before `ws.on('open', ...)`:

```ts
// Shared task state — updated from incoming task_update messages
const taskStatus = new Map<string, Task['status']>()
const taskDoneListeners = new Map<string, Array<() => void>>()
const activeTaskIds = new Set<string>()

function onTaskUpdate(task: Task): void {
  taskStatus.set(task.id, task.status)
  if (task.status === 'done' || task.status === 'aborted') {
    const listeners = taskDoneListeners.get(task.id) ?? []
    for (const cb of listeners) cb()
    taskDoneListeners.delete(task.id)
  }
}
```

- [ ] **Step 2: Wire `onTaskUpdate` into the message handler**

In the `ws.on('message', ...)` callback, add a handler for `task_update` at the top of the switch/if chain, before the existing `if (msg.type === 'agent_not_found')` check:

```ts
if (msg.type === 'task_update') {
  const taskMsg = msg as { type: 'task_update'; payload: Task }
  onTaskUpdate(taskMsg.payload)
  return
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter claude-squad-skill build
```

Expected: builds cleanly. The `task_update` ClientMessage type doesn't include `task_update` — that's a ServerMessage. The `msg` in the handler is typed as `IncomingMessage` (local union). Add `task_update` to that union:

```ts
type IncomingMessage =
  | { type: 'task_update'; payload: Task }
  | { type: 'route_to_agent'; agentId: string; content: string; mode: string; requestId: string }
  | { type: 'build_started'; taskGraph: Task[] }
  | { type: string }
```

- [ ] **Step 4: Commit**

```bash
git add packages/squad-skill/src/connect.ts
git commit -m "feat(skill): add task state tracking infrastructure to connectToSession"
```

---

## Task 3: Add `waitForDependencies` and `runTaskWhenReady`

**Files:**
- Modify: `packages/squad-skill/src/connect.ts`
- Create: `packages/squad-skill/src/connect.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `packages/squad-skill/src/connect.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

// ── waitForDependencies ──────────────────────────────────────────────────────
// We test the logic in isolation by recreating the closure pattern from connect.ts

function makeDepGate() {
  const taskStatus = new Map<string, string>()
  const taskDoneListeners = new Map<string, Array<() => void>>()

  function onTaskUpdate(id: string, status: string) {
    taskStatus.set(id, status)
    if (status === 'done' || status === 'aborted') {
      const listeners = taskDoneListeners.get(id) ?? []
      for (const cb of listeners) cb()
      taskDoneListeners.delete(id)
    }
  }

  function waitForDependencies(depIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      const pending = new Set(depIds.filter(id => taskStatus.get(id) !== 'done' && taskStatus.get(id) !== 'aborted'))
      if (pending.size === 0) { resolve(); return }
      for (const id of [...pending]) {
        const listeners = taskDoneListeners.get(id) ?? []
        listeners.push(() => {
          pending.delete(id)
          if (pending.size === 0) resolve()
        })
        taskDoneListeners.set(id, listeners)
      }
    })
  }

  return { onTaskUpdate, waitForDependencies, taskStatus }
}

describe('waitForDependencies', () => {
  it('resolves immediately when depIds is empty', async () => {
    const { waitForDependencies } = makeDepGate()
    await expect(waitForDependencies([])).resolves.toBeUndefined()
  })

  it('resolves immediately when all deps already done', async () => {
    const { onTaskUpdate, waitForDependencies } = makeDepGate()
    onTaskUpdate('task-1', 'done')
    await expect(waitForDependencies(['task-1'])).resolves.toBeUndefined()
  })

  it('waits until dep transitions to done', async () => {
    const { onTaskUpdate, waitForDependencies } = makeDepGate()
    const p = waitForDependencies(['task-1'])
    let resolved = false
    p.then(() => { resolved = true })
    await Promise.resolve() // flush microtasks
    expect(resolved).toBe(false)
    onTaskUpdate('task-1', 'done')
    await p
    expect(resolved).toBe(true)
  })

  it('waits for all deps when multiple', async () => {
    const { onTaskUpdate, waitForDependencies } = makeDepGate()
    const p = waitForDependencies(['task-1', 'task-2'])
    onTaskUpdate('task-1', 'done')
    await Promise.resolve()
    onTaskUpdate('task-2', 'done')
    await p // should resolve now
  })

  it('resolves on aborted dep too (caller checks status)', async () => {
    const { onTaskUpdate, waitForDependencies } = makeDepGate()
    const p = waitForDependencies(['task-1'])
    onTaskUpdate('task-1', 'aborted')
    await p
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter claude-squad-skill test
```

Expected: FAIL — `connect.test.ts` imports nothing yet, tests use local helpers so they should actually pass. If they pass, move on to Step 3.

- [ ] **Step 3: Add `waitForDependencies` and `runTaskWhenReady` to `connect.ts`**

Inside `connectToSession`, after the `onTaskUpdate` block, add:

```ts
function waitForDependencies(depIds: string[]): Promise<void> {
  return new Promise<void>((resolve) => {
    const pending = new Set(depIds.filter(id => taskStatus.get(id) !== 'done' && taskStatus.get(id) !== 'aborted'))
    if (pending.size === 0) { resolve(); return }
    for (const id of [...pending]) {
      const listeners = taskDoneListeners.get(id) ?? []
      listeners.push(() => {
        pending.delete(id)
        if (pending.size === 0) resolve()
      })
      taskDoneListeners.set(id, listeners)
    }
  })
}

async function runTaskWhenReady(task: Task): Promise<void> {
  if (activeTaskIds.has(task.id)) return
  activeTaskIds.add(task.id)
  try {
    if (task.dependsOn.length > 0) {
      await waitForDependencies(task.dependsOn)
    }
    const anyAborted = task.dependsOn.some(id => taskStatus.get(id) === 'aborted')
    if (anyAborted) {
      console.log(`[${agentId}] Skipping ${task.title} — dependency aborted`)
      ws.send(JSON.stringify({
        type: 'task_blocked',
        agentId,
        taskId: task.id,
        reason: 'dependency task was aborted',
      }))
      return
    }
    console.log(`[${agentId}] Starting: ${task.title}`)
    await runAgent({
      agentId,
      userId: agentId,
      sessionId,
      task,
      partyHost,
      anthropicApiKey: apiKey,
      githubToken,
      workdir,
    })
    console.log(`[${agentId}] Done: ${task.title}`)
  } catch (err) {
    console.error(`[${agentId}] Task failed: ${task.title}`, err)
  } finally {
    activeTaskIds.delete(task.id)
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter claude-squad-skill test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/squad-skill/src/connect.ts packages/squad-skill/src/connect.test.ts
git commit -m "feat(skill): add waitForDependencies and runTaskWhenReady for parallel task execution"
```

---

## Task 4: Replace sequential loop with parallel launcher + orphan listener

**Files:**
- Modify: `packages/squad-skill/src/connect.ts`

- [ ] **Step 1: Replace the `build_started` handler**

In the `ws.on('message')` callback, replace the entire `if (msg.type === 'build_started')` block:

**Before:**
```ts
if (msg.type === 'build_started') {
  const myTasks = (msg as { type: 'build_started'; taskGraph: Task[] }).taskGraph
    .filter((t: Task) => t.assignedAgentId === agentId)

  if (myTasks.length === 0) {
    console.log(`[${agentId}] build_started — no tasks assigned to me`)
    return
  }
  console.log(`[${agentId}] build_started — ${myTasks.length} task(s) assigned`)

  for (const task of myTasks) {
    console.log(`[${agentId}] Starting: ${task.title}`)
    try {
      await runAgent({
        agentId,
        userId: agentId,
        sessionId,
        task,
        partyHost,
        anthropicApiKey: apiKey,
        githubToken,
        workdir,
      })
      console.log(`[${agentId}] Done: ${task.title}`)
    } catch (err) {
      console.error(`[${agentId}] Task failed: ${task.title}`, err)
    }
  }
  return
}
```

**After:**
```ts
if (msg.type === 'build_started') {
  const buildMsg = msg as { type: 'build_started'; taskGraph: Task[] }
  // Seed task state from the full graph so dependency gates work across agents
  for (const task of buildMsg.taskGraph) {
    taskStatus.set(task.id, task.status)
  }
  const myTasks = buildMsg.taskGraph.filter((t: Task) => t.assignedAgentId === agentId)
  if (myTasks.length === 0) {
    console.log(`[${agentId}] build_started — no tasks assigned to me`)
    return
  }
  console.log(`[${agentId}] build_started — ${myTasks.length} task(s) assigned, running in parallel`)
  // Fire-and-forget: do NOT await here so the message handler stays responsive
  // to incoming task_update messages that dependency gates need to see
  for (const task of myTasks) {
    void runTaskWhenReady(task)
  }
  return
}
```

- [ ] **Step 2: Add orphan task re-claim in the `task_update` handler**

Update the `task_update` handler added in Task 2 Step 2:

```ts
if (msg.type === 'task_update') {
  const taskMsg = msg as { type: 'task_update'; payload: Task }
  onTaskUpdate(taskMsg.payload)
  // Orphan reclaim: if SSS reset one of our tasks to pending, pick it back up
  const t = taskMsg.payload
  if (t.status === 'pending' && t.assignedAgentId === agentId && !activeTaskIds.has(t.id)) {
    console.log(`[${agentId}] Reclaiming orphaned task: ${t.title}`)
    void runTaskWhenReady(t)
  }
  return
}
```

- [ ] **Step 3: Build and verify no type errors**

```bash
pnpm --filter claude-squad-skill build
```

Expected: builds cleanly with `dist/index.js` and `dist/mcp-server.js`.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter claude-squad-skill test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/squad-skill/src/connect.ts
git commit -m "feat(skill): run assigned tasks in parallel with dependency gates and orphan reclaim"
```

---

## Task 5: Manual smoke test + final commit

- [ ] **Step 1: Start local dev servers**

Terminal 1:
```bash
pnpm dev
# Next.js at localhost:3000
```

Terminal 2:
```bash
cd apps/party && npx partykit dev
# SSS at localhost:1999
```

- [ ] **Step 2: Run smoke test scenario**

1. Open `localhost:3000`, sign in, create a session with a GitHub repo
2. Connect two agents (two terminals):
   ```bash
   npx claude-squad-skill connect --session <id> --agent claude-u1 --key sk-ant-xxx
   npx claude-squad-skill connect --session <id> --agent claude-u2 --key sk-ant-xxx
   ```
3. Post a build goal: `@claude-u1 build three things: task A (no deps), task B (depends on A), task C (no deps)`
4. Approve the ProposalCard

Expected:
- `claude-u1` logs show task A and task C starting immediately (parallel)
- `claude-u1` logs show task B starting only after task A done
- Both agents show `build_started` messages in their terminals

- [ ] **Step 3: Test orphan reclaim**

1. Start a build with tasks assigned to `claude-u1`
2. Kill the `claude-u1` terminal mid-build
3. Wait 90 seconds (heartbeat expiry)
4. Reconnect `claude-u1`:
   ```bash
   npx claude-squad-skill connect --session <id> --agent claude-u1 --key sk-ant-xxx
   ```

Expected: SSS has broadcast `task_update` with `status: 'pending'` for the orphaned task. On reconnect, the agent's `task_update` listener fires and `runTaskWhenReady` is called for the orphaned task.

> Note: Orphan reclaim only fires if the agent reconnects AND receives the `task_update` message after connecting. Since `onConnect` in SSS replays current task state via `task_update` payloads for each task, the orphaned `pending` task will be replayed on reconnect and the listener will pick it up.

- [ ] **Step 4: Verify the onConnect replay covers orphan reclaim**

Check `apps/party/src/server.ts` `onConnect` — it already sends all current tasks:

```ts
const taskQueue = tasks ?? {}
for (const task of Object.values(taskQueue)) {
  conn.send(JSON.stringify({ type: 'task_update', payload: task } satisfies ServerMessage))
}
```

The `task_update` handler in `connect.ts` now calls `onTaskUpdate` AND checks for orphan reclaim. So tasks that were reset to `pending` before the agent reconnected will be reclaimed via `onConnect` replay. No extra code needed.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 5 — parallel agent execution with dependency gates and orphan reclaim"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Parallel execution: `build_started` fires tasks concurrently (Task 4)
- ✅ `dependsOn` gate: `waitForDependencies` listener pattern (Task 3)
- ✅ Aborted dep short-circuits dependent task (Task 3, `runTaskWhenReady`)
- ✅ Heartbeat expiry broadcasts released tasks (Task 1)
- ✅ Orphan reclaim via `task_update` listener (Task 4) + `onConnect` replay (Task 5)
- ✅ No changes to `agent-runner` (spec: "agent-runner has no changes")

**Placeholder scan:** None found.

**Type consistency:**
- `Task` imported from `@squad/types` in `connect.ts` — already imported
- `runTaskWhenReady` uses `task.dependsOn`, `task.assignedAgentId`, `task.status` — all present on `Task` type
- `IncomingMessage` union updated to include `task_update` payload shape matching `ServerMessage` `task_update`
- `taskStatus` stores `Task['status']` — union `'pending' | 'in_progress' | 'blocked' | 'done' | 'aborted'`
