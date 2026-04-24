# Phase 4: Build Dispatch + Agent Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `/api/approve` to dispatch build tasks to locally-connected agents via SSS, implement the full agent-runner package (Claude Code SDK loop with hooks + tools), and enable the squad-skill CLI to execute assigned tasks.

**Architecture:** When host approves, the Next.js approve route calls a new SSS HTTP `/dispatch` endpoint that stores tasks + ownerships and broadcasts `build_started`. The locally-running `squad-skill` CLI (already connected via WebSocket) handles `build_started`, identifies its tasks, and calls `runAgent()` from `@squad/agent-runner`. The runner executes a Claude Code SDK `query()` loop with ownership enforcement hooks, status broadcast hooks, and custom tools for API contracts and shared write requests.

**Tech Stack:** `@anthropic-ai/claude-code` SDK (`query()` loop with hooks), `@octokit/rest` (GitHub), `ws` (WebSocket client), Node.js `child_process` (git push), Partykit SSS (HTTP + WebSocket)

---

## File Map

**New files:**
- `packages/agent-runner/src/types.ts` — RunAgentOptions, SSSHttpOptions, OwnershipResult
- `packages/agent-runner/src/sss-client.ts` — HTTP + WebSocket SSS client helpers
- `packages/agent-runner/src/github.ts` — Octokit branch/push/PR operations
- `packages/agent-runner/src/hooks/ownership.ts` — makeOwnershipHook (PreToolUse)
- `packages/agent-runner/src/hooks/bash-safety.ts` — makeBashSafetyHook (PreToolUse)
- `packages/agent-runner/src/hooks/status-broadcast.ts` — makeStatusBroadcastHook (PostToolUse)
- `packages/agent-runner/src/hooks/task-done.ts` — makeTaskDoneHook (TaskCompleted)
- `packages/agent-runner/src/tools/publish-contract.ts` — PublishApiContract schema + handler
- `packages/agent-runner/src/tools/request-shared-write.ts` — RequestSharedWrite schema + handler
- `packages/agent-runner/src/context.ts` — buildContextInjection() fetches from SSS
- `packages/agent-runner/src/runner.ts` — main runAgent() loop
- `packages/agent-runner/tsconfig.json`
- `apps/web/src/app/api/merge/route.ts` — merge trigger stub

**Modified files:**
- `packages/agent-runner/package.json` — add @anthropic-ai/claude-code, @octokit/rest, ws
- `packages/agent-runner/src/index.ts` — replace stub with real exports
- `packages/types/src/messages.ts` — add `broadcast_agent_message` to ClientMessage
- `apps/party/src/server.ts` — add /dispatch HTTP endpoint + handle broadcast_agent_message
- `apps/web/src/app/api/approve/route.ts` — call SSS dispatch endpoint with real tasks
- `packages/squad-skill/src/connect.ts` — handle build_started, call runAgent
- `packages/squad-skill/package.json` — add @squad/agent-runner workspace dep

---

## Task 1: Update @squad/types — add broadcast_agent_message to ClientMessage

**Files:**
- Modify: `packages/types/src/messages.ts`

- [ ] **Step 1: Add the new message variant**

In `packages/types/src/messages.ts`, replace the `ClientMessage` type:

```typescript
export type ClientMessage =
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
  | { type: 'dispatch_tasks'; tasks: Task[] }
  | { type: 'session_close' }
  | { type: 'broadcast_agent_message'; agentId: string; content: string; mode: AgentMode }
```

- [ ] **Step 2: Verify types compile**

```bash
cd packages/types && pnpm typecheck
```
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/messages.ts
git commit -m "feat(types): add broadcast_agent_message to ClientMessage"
```

---

## Task 2: Wire SSS — handle broadcast_agent_message + add /dispatch HTTP endpoint

**Files:**
- Modify: `apps/party/src/server.ts`

- [ ] **Step 1: Add broadcast_agent_message case in applyClientMessage switch**

Inside the `applyClientMessage` function, add a case so TypeScript doesn't complain about unhandled variants:

```typescript
case 'broadcast_agent_message': {
  // State-less — handled at server level in onMessage, not here
  break
}
```

- [ ] **Step 2: Add broadcast in onMessage**

After the existing `if (msg.type === 'publish_contract')` block in `onMessage`, add:

```typescript
if (msg.type === 'broadcast_agent_message') {
  this.room.broadcast(JSON.stringify({
    type: 'agent_message',
    agentId: msg.agentId,
    content: msg.content,
    mode: msg.mode,
  } satisfies ServerMessage))
}
```

- [ ] **Step 3: Add /dispatch to onRequest**

In the `onRequest` method, add before the final `return new Response('Not found', ...)`:

```typescript
if (resource === 'dispatch') {
  return this.handleDispatch(req)
}
```

- [ ] **Step 4: Add handleDispatch private method**

```typescript
private async handleDispatch(req: Party.Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const body = await req.json() as {
    tasks: Task[]
    ownerships: Array<{ path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }>
  }

  // Store tasks
  const existingTasks = (await this.room.storage.get<TaskQueue>('tasks')) ?? {}
  const updatedTasks = { ...existingTasks }
  for (const task of body.tasks) {
    updatedTasks[task.id] = task
  }
  await this.room.storage.put('tasks', updatedTasks)

  // Store ownerships
  const existingOwnership = (await this.room.storage.get<OwnershipMap>('ownership')) ?? {}
  let updatedOwnership = { ...existingOwnership }
  for (const o of body.ownerships) {
    const result = handleOwnershipPost(updatedOwnership, o)
    updatedOwnership = result.updated
  }
  await this.room.storage.put('ownership', updatedOwnership)

  // Update session status
  const session = await this.room.storage.get<SessionState>('session')
  if (session) {
    await this.room.storage.put('session', { ...session, status: 'building' })
  }

  // Broadcast build_started + ownership update
  this.room.broadcast(JSON.stringify({
    type: 'build_started',
    taskGraph: body.tasks,
  } satisfies ServerMessage))
  this.room.broadcast(JSON.stringify({
    type: 'ownership_update',
    payload: updatedOwnership,
  } satisfies ServerMessage))

  return Response.json({ ok: true })
}
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/party && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/party/src/server.ts
git commit -m "feat(party): add /dispatch HTTP endpoint + handle broadcast_agent_message"
```

---

## Task 3: Update agent-runner package.json + tsconfig

**Files:**
- Modify: `packages/agent-runner/package.json`
- Create: `packages/agent-runner/tsconfig.json`

- [ ] **Step 1: Replace package.json**

```json
{
  "name": "@squad/agent-runner",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-code": "^1.0.0",
    "@octokit/rest": "^20.0.0",
    "@squad/types": "workspace:*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.14",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "paths": {
      "@squad/types": ["../../packages/types/src/index.ts"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install deps**

```bash
pnpm install
```
Expected: lock file updated, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-runner/package.json packages/agent-runner/tsconfig.json pnpm-lock.yaml
git commit -m "feat(agent-runner): add claude-code SDK, octokit, ws dependencies"
```

---

## Task 4: `packages/agent-runner/src/types.ts`

**Files:**
- Create: `packages/agent-runner/src/types.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { Task } from '@squad/types'

export interface RunAgentOptions {
  agentId: string
  userId: string
  sessionId: string
  task: Task
  partyHost: string       // e.g. "localhost:1999" or "myapp.partykit.dev"
  anthropicApiKey: string
  githubToken?: string    // if set, branch push + PR creation enabled
  workdir: string         // absolute path to project root agent should work in
}

export interface SSSHttpOptions {
  partyHost: string
  sessionId: string
}

export interface OwnershipResult {
  owned: boolean
  agentId: string | null
  tier: string | null
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/agent-runner && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/agent-runner/src/types.ts
git commit -m "feat(agent-runner): RunAgentOptions + SSSHttpOptions + OwnershipResult types"
```

---

## Task 5: `packages/agent-runner/src/sss-client.ts`

**Files:**
- Create: `packages/agent-runner/src/sss-client.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { SSSHttpOptions, OwnershipResult } from './types.js'
import type { ContextInjection } from '@squad/types'
import type WebSocket from 'ws'

const SHARED_RO_PATHS = [
  'src/types/shared.ts',
  'package.json',
  'tsconfig.json',
  '.env.example',
]

function sssBase(opts: SSSHttpOptions): string {
  const scheme = opts.partyHost.startsWith('localhost') ? 'http' : 'https'
  return `${scheme}://${opts.partyHost}/parties/main/${opts.sessionId}`
}

export async function getOwnership(
  opts: SSSHttpOptions,
  filePath: string
): Promise<OwnershipResult> {
  const encoded = encodeURIComponent(filePath.replace(/^\//, ''))
  const res = await fetch(`${sssBase(opts)}/ownership/${encoded}`)
  if (!res.ok) return { owned: false, agentId: null, tier: null }
  return res.json() as Promise<OwnershipResult>
}

export async function postOwnership(
  opts: SSSHttpOptions,
  body: { path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }
): Promise<void> {
  await fetch(`${sssBase(opts)}/ownership`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function getContextInjection(
  opts: SSSHttpOptions,
  agentId: string
): Promise<ContextInjection> {
  const res = await fetch(`${sssBase(opts)}/context-injection/${agentId}`)
  if (!res.ok) throw new Error(`Context injection failed: ${res.status}`)
  return res.json() as Promise<ContextInjection>
}

export async function postTokenUpdate(
  opts: SSSHttpOptions,
  body: { userId: string; tokensIn: number; tokensOut: number }
): Promise<void> {
  await fetch(`${sssBase(opts)}/token-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function broadcastAgentMessage(
  ws: WebSocket,
  agentId: string,
  content: string,
  mode: 'building' | 'status'
): void {
  ws.send(JSON.stringify({ type: 'broadcast_agent_message', agentId, content, mode }))
}

export function sendWsMessage(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg))
}

export function isSharedRO(filePath: string): boolean {
  const normalized = filePath.replace(/^\//, '')
  return SHARED_RO_PATHS.includes(normalized)
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/agent-runner && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/agent-runner/src/sss-client.ts
git commit -m "feat(agent-runner): SSS HTTP + WebSocket client helpers"
```

---

## Task 6: `packages/agent-runner/src/github.ts`

**Files:**
- Create: `packages/agent-runner/src/github.ts`

All operations are no-ops if `githubToken` is not passed — the runner never crashes due to missing GitHub config.

- [ ] **Step 1: Create the file**

```typescript
import { Octokit } from '@octokit/rest'
import { execSync } from 'node:child_process'

export interface GitHubClientOptions {
  token: string
  owner: string
  repo: string
  workdir: string
}

export function createGitHubClient(opts: GitHubClientOptions) {
  const octokit = new Octokit({ auth: opts.token })

  async function createBranch(branchName: string, base: string): Promise<void> {
    const { data: ref } = await octokit.git.getRef({
      owner: opts.owner,
      repo: opts.repo,
      ref: `heads/${base}`,
    })
    await octokit.git.createRef({
      owner: opts.owner,
      repo: opts.repo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    }).catch((err: { status?: number }) => {
      if (err.status !== 422) throw err  // 422 = already exists, safe to ignore
    })
  }

  function pushBranch(branchName: string): void {
    execSync(`git push origin ${branchName}`, { cwd: opts.workdir, stdio: 'pipe' })
  }

  async function createPR(title: string, head: string, base: string, body: string): Promise<string> {
    const { data } = await octokit.pulls.create({
      owner: opts.owner,
      repo: opts.repo,
      title,
      head,
      base,
      body,
    })
    return data.html_url
  }

  return { createBranch, pushBranch, createPR }
}

export type GitHubClient = ReturnType<typeof createGitHubClient>
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/agent-runner && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/agent-runner/src/github.ts
git commit -m "feat(agent-runner): GitHub client — createBranch, pushBranch, createPR via Octokit"
```

---

## Task 7: Hooks — ownership.ts + bash-safety.ts

**Files:**
- Create: `packages/agent-runner/src/hooks/ownership.ts`
- Create: `packages/agent-runner/src/hooks/bash-safety.ts`

- [ ] **Step 1: Create ownership hook**

```typescript
// packages/agent-runner/src/hooks/ownership.ts
import { getOwnership, broadcastAgentMessage, isSharedRO } from '../sss-client.js'
import type { SSSHttpOptions } from '../types.js'
import type WebSocket from 'ws'

interface PreToolUseInput {
  tool_name: string
  tool_input: Record<string, unknown>
}

interface HookDecision {
  decision?: 'block'
  reason?: string
}

export function makeOwnershipHook(
  agentId: string,
  taskId: string,
  sssOpts: SSSHttpOptions,
  ws: WebSocket
) {
  return async (input: PreToolUseInput): Promise<HookDecision> => {
    const filePath = (input.tool_input.file_path ?? input.tool_input.path) as string | undefined
    if (!filePath) return {}

    if (isSharedRO(filePath)) {
      return {
        decision: 'block',
        reason: `${filePath} is a SHARED-RO file. Use RequestSharedWrite({ filePath, changeDescription, suggestedContent }) instead of writing directly.`,
      }
    }

    let ownership: Awaited<ReturnType<typeof getOwnership>>
    try {
      ownership = await getOwnership(sssOpts, filePath)
    } catch {
      broadcastAgentMessage(ws, agentId, `SSS unreachable — blocking write to ${filePath}`, 'status')
      return { decision: 'block', reason: 'SSS unavailable — cannot verify ownership' }
    }

    if (!ownership.owned) {
      broadcastAgentMessage(ws, agentId, `Blocked: unowned file ${filePath}`, 'status')
      return {
        decision: 'block',
        reason: `${filePath} is not assigned to any task. This is a decomposition error. Stop and post a BLOCKED status.`,
      }
    }

    if (ownership.agentId !== agentId) {
      return {
        decision: 'block',
        reason: `${filePath} is owned by ${ownership.agentId}. Consume its interface via API contracts instead.`,
      }
    }

    return {}
  }
}
```

- [ ] **Step 2: Create bash safety hook**

```typescript
// packages/agent-runner/src/hooks/bash-safety.ts

interface PreToolUseInput {
  tool_name: string
  tool_input: Record<string, unknown>
}

interface HookDecision {
  decision?: 'block'
  reason?: string
}

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+-rf\s+\//, reason: 'Recursive root deletion blocked' },
  { pattern: /git\s+push\s+.*--force/, reason: 'Force push blocked — use orchestrator merge flow' },
  { pattern: /git\s+checkout\s+main/, reason: 'Cannot switch to main branch — stay on your agent branch' },
  { pattern: /npm\s+install\s+-g/, reason: 'Global npm installs blocked in sandbox' },
  { pattern: /curl.*\|\s*sh/, reason: 'Piped shell execution blocked' },
  { pattern: /git\s+merge|git\s+rebase/, reason: 'Do not merge/rebase manually. Signal DONE to the orchestrator — it handles merging.' },
]

export function makeBashSafetyHook() {
  return async (input: PreToolUseInput): Promise<HookDecision> => {
    const command = (input.tool_input.command ?? '') as string
    for (const { pattern, reason } of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return { decision: 'block', reason }
      }
    }
    return {}
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/agent-runner && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-runner/src/hooks/ownership.ts packages/agent-runner/src/hooks/bash-safety.ts
git commit -m "feat(agent-runner): ownership + bash-safety PreToolUse hooks"
```

---

## Task 8: Hooks — status-broadcast.ts + task-done.ts

**Files:**
- Create: `packages/agent-runner/src/hooks/status-broadcast.ts`
- Create: `packages/agent-runner/src/hooks/task-done.ts`

- [ ] **Step 1: Create status-broadcast hook**

```typescript
// packages/agent-runner/src/hooks/status-broadcast.ts
import { broadcastAgentMessage } from '../sss-client.js'
import type WebSocket from 'ws'

interface PostToolUseInput {
  tool_name: string
  tool_input: Record<string, unknown>
}

export function makeStatusBroadcastHook(agentId: string, ws: WebSocket) {
  return async (input: PostToolUseInput): Promise<void> => {
    if (!['Write', 'Edit'].includes(input.tool_name)) return
    const filePath = (input.tool_input.file_path ?? input.tool_input.path) as string | undefined
    if (!filePath) return
    broadcastAgentMessage(ws, agentId, `Wrote ${filePath}`, 'status')
  }
}
```

- [ ] **Step 2: Create task-done hook**

```typescript
// packages/agent-runner/src/hooks/task-done.ts
import { broadcastAgentMessage, sendWsMessage, postTokenUpdate } from '../sss-client.js'
import type { SSSHttpOptions } from '../types.js'
import type { Task } from '@squad/types'
import type WebSocket from 'ws'
import type { GitHubClient } from '../github.js'

interface TaskCompletedInput {
  usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number }
}

export function makeTaskDoneHook(
  agentId: string,
  userId: string,
  task: Task,
  sssOpts: SSSHttpOptions,
  ws: WebSocket,
  github: GitHubClient | null
) {
  return async (input: TaskCompletedInput): Promise<void> => {
    const tokensIn = input.usage?.input_tokens ?? 0
    const tokensOut = input.usage?.output_tokens ?? 0
    const tokensUsed = input.usage?.total_tokens ?? (tokensIn + tokensOut)

    // Mark task done in SSS
    sendWsMessage(ws, { type: 'task_done', agentId, taskId: task.id, tokensUsed })

    // Report per-task token usage to SSS meter (exact, from ResultMessage)
    await postTokenUpdate(sssOpts, { userId, tokensIn, tokensOut })

    // Push branch if GitHub configured
    if (github) {
      try {
        github.pushBranch(`agent-${agentId}`)
      } catch (err) {
        broadcastAgentMessage(ws, agentId, `Branch push failed: ${(err as Error).message}`, 'status')
      }
    }

    broadcastAgentMessage(ws, agentId, `Task complete: ${task.title}. Branch pushed.`, 'status')
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/agent-runner && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-runner/src/hooks/status-broadcast.ts packages/agent-runner/src/hooks/task-done.ts
git commit -m "feat(agent-runner): status-broadcast + task-done PostToolUse/TaskCompleted hooks"
```

---

## Task 9: Custom tools — publish-contract.ts + request-shared-write.ts

**Files:**
- Create: `packages/agent-runner/src/tools/publish-contract.ts`
- Create: `packages/agent-runner/src/tools/request-shared-write.ts`

- [ ] **Step 1: Create PublishApiContract tool**

```typescript
// packages/agent-runner/src/tools/publish-contract.ts
import { sendWsMessage } from '../sss-client.js'
import type WebSocket from 'ws'

export const publishContractSchema = {
  name: 'PublishApiContract',
  description: 'Publish an API contract (HTTP route or module export) to the SSS so other agents can consume it. Call this BEFORE implementing the route.',
  input_schema: {
    type: 'object' as const,
    properties: {
      routeKey: { type: 'string', description: 'Unique key: "POST /api/auth/login" or "module:exportName"' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
      path: { type: 'string', description: 'URL path (for HTTP contracts)' },
      description: { type: 'string', description: 'What this contract exposes' },
      requestSchema: { type: 'object', description: 'JSON Schema for the request body' },
      responseSchema: { type: 'object', description: 'JSON Schema for the success response' },
    },
    required: ['routeKey', 'description'] as string[],
  },
}

export function makePublishContractHandler(agentId: string, ws: WebSocket) {
  return async (input: {
    routeKey: string
    method?: string
    path?: string
    description: string
    requestSchema?: object
    responseSchema?: object
  }): Promise<string> => {
    const contract = {
      method: input.method ?? '',
      path: input.path ?? '',
      publishedByAgentId: agentId,
      requestSchema: input.requestSchema ?? {},
      responseSchema: input.responseSchema ?? {},
      publishedAt: new Date().toISOString(),
    }
    sendWsMessage(ws, { type: 'publish_contract', contract })
    return `Contract published: ${input.routeKey}. Other agents can now reference it.`
  }
}
```

- [ ] **Step 2: Create RequestSharedWrite tool**

```typescript
// packages/agent-runner/src/tools/request-shared-write.ts
import { broadcastAgentMessage } from '../sss-client.js'
import type WebSocket from 'ws'

export const requestSharedWriteSchema = {
  name: 'RequestSharedWrite',
  description: 'Request a change to a shared read-only file (package.json, shared types, tsconfig.json, .env.example). Do not attempt to write these files directly.',
  input_schema: {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string', description: 'The shared file to modify' },
      changeDescription: { type: 'string', description: 'What change you need and why' },
      suggestedContent: { type: 'string', description: 'Your suggested addition or modification' },
    },
    required: ['filePath', 'changeDescription'] as string[],
  },
}

export function makeRequestSharedWriteHandler(agentId: string, ws: WebSocket) {
  return async (input: {
    filePath: string
    changeDescription: string
    suggestedContent?: string
  }): Promise<string> => {
    broadcastAgentMessage(
      ws,
      agentId,
      `[SharedWriteRequest] ${input.filePath}: ${input.changeDescription}`,
      'status'
    )
    return `Shared write request submitted for ${input.filePath}. Waiting for orchestrator to apply.`
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/agent-runner && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-runner/src/tools/
git commit -m "feat(agent-runner): PublishApiContract + RequestSharedWrite custom tools"
```

---

## Task 10: `packages/agent-runner/src/context.ts`

**Files:**
- Create: `packages/agent-runner/src/context.ts`

- [ ] **Step 1: Create the file**

```typescript
import { getContextInjection } from './sss-client.js'
import type { SSSHttpOptions } from './types.js'

export async function buildContextInjection(
  sssOpts: SSSHttpOptions,
  agentId: string
): Promise<string> {
  try {
    const injection = await getContextInjection(sssOpts, agentId)
    return injection.content
  } catch (err) {
    console.warn(`[${agentId}] Context injection unavailable: ${(err as Error).message}`)
    return `You are ${agentId}, a collaborative AI agent. The session state server is temporarily unavailable. Proceed with the task description provided in the prompt.`
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/agent-runner && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/agent-runner/src/context.ts
git commit -m "feat(agent-runner): buildContextInjection fetches from SSS with fallback"
```

---

## Task 11: `packages/agent-runner/src/runner.ts` — main runAgent()

**Files:**
- Create: `packages/agent-runner/src/runner.ts`

- [ ] **Step 1: Create the file**

```typescript
import { query } from '@anthropic-ai/claude-code'
import WebSocket from 'ws'
import { buildContextInjection } from './context.js'
import { makeOwnershipHook } from './hooks/ownership.js'
import { makeBashSafetyHook } from './hooks/bash-safety.js'
import { makeStatusBroadcastHook } from './hooks/status-broadcast.js'
import { makeTaskDoneHook } from './hooks/task-done.js'
import { publishContractSchema, makePublishContractHandler } from './tools/publish-contract.js'
import { requestSharedWriteSchema, makeRequestSharedWriteHandler } from './tools/request-shared-write.js'
import { broadcastAgentMessage, sendWsMessage } from './sss-client.js'
import { createGitHubClient } from './github.js'
import type { RunAgentOptions } from './types.js'

export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const { agentId, userId, sessionId, task, partyHost, anthropicApiKey, githubToken, workdir } = opts
  const sssOpts = { partyHost, sessionId }

  // Connect WebSocket to SSS
  const wsScheme = partyHost.startsWith('localhost') ? 'ws' : 'wss'
  const ws = new WebSocket(`${wsScheme}://${partyHost}/parties/main/${sessionId}`)

  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })

  // Announce presence + claim task
  sendWsMessage(ws, { type: 'update_status', agentId, status: 'building' })
  sendWsMessage(ws, { type: 'task_claim', agentId, taskId: task.id })

  // Heartbeat every 30s
  const heartbeatInterval = setInterval(() => {
    sendWsMessage(ws, { type: 'heartbeat', agentId })
  }, 30_000)

  // GitHub client (optional — only if token provided)
  let github = null
  if (githubToken) {
    // Parse owner/repo from workdir path (last two segments)
    const parts = workdir.replace(/\\/g, '/').split('/')
    if (parts.length >= 2) {
      github = createGitHubClient({
        token: githubToken,
        owner: parts[parts.length - 2],
        repo: parts[parts.length - 1],
        workdir,
      })
    }
  }

  const systemPrompt = await buildContextInjection(sssOpts, agentId)
  const ownershipHook = makeOwnershipHook(agentId, task.id, sssOpts, ws)
  const bashSafetyHook = makeBashSafetyHook()
  const statusBroadcastHook = makeStatusBroadcastHook(agentId, ws)
  const taskDoneHook = makeTaskDoneHook(agentId, userId, task, sssOpts, ws, github)
  const publishContractHandler = makePublishContractHandler(agentId, ws)
  const requestSharedWriteHandler = makeRequestSharedWriteHandler(agentId, ws)

  broadcastAgentMessage(ws, agentId, `Starting task: ${task.title}`, 'status')

  try {
    for await (const message of query({
      prompt: `${task.description}\n\nAcceptance criteria:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`,
      options: {
        cwd: workdir,
        systemPrompt,
        apiKey: anthropicApiKey,
        permissionMode: 'acceptEdits',
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
        customTools: [
          { ...publishContractSchema, handler: publishContractHandler },
          { ...requestSharedWriteSchema, handler: requestSharedWriteHandler },
        ],
        hooks: {
          PreToolUse: [
            { matcher: 'Write', hooks: [ownershipHook] },
            { matcher: 'Edit', hooks: [ownershipHook] },
            { matcher: 'Bash', hooks: [bashSafetyHook] },
          ],
          PostToolUse: [
            { matcher: '*', hooks: [statusBroadcastHook] },
          ],
          TaskCompleted: [
            { matcher: '*', hooks: [taskDoneHook] },
          ],
        },
      },
    })) {
      await handleMessage(message, agentId, task.id, ws)
    }
  } finally {
    clearInterval(heartbeatInterval)
    sendWsMessage(ws, { type: 'update_status', agentId, status: 'idle' })
    ws.close()
  }
}

type SDKMessage = {
  type: string
  message?: { content: Array<{ type: string; text?: string }> }
  subtype?: string
}

async function handleMessage(
  message: SDKMessage,
  agentId: string,
  taskId: string,
  ws: WebSocket
): Promise<void> {
  switch (message.type) {
    case 'assistant': {
      if (!message.message) break
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text?.trim()) {
          broadcastAgentMessage(ws, agentId, block.text, 'building')
        }
      }
      break
    }
    case 'result': {
      if (message.subtype === 'error_max_turns') {
        sendWsMessage(ws, {
          type: 'task_blocked',
          agentId,
          taskId,
          reason: 'Agent reached max turns without completing task.',
        })
      }
      break
    }
    case 'system': {
      console.log(`[${agentId}] system:`, message)
      break
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/agent-runner && pnpm typecheck
```
Expected: exit 0. If `query()` types differ from what the SDK exports (the SDK is new — types may vary), check `node_modules/@anthropic-ai/claude-code/dist/index.d.ts` for the actual `query` signature and adjust `options` accordingly.

- [ ] **Step 3: Commit**

```bash
git add packages/agent-runner/src/runner.ts
git commit -m "feat(agent-runner): main runAgent() — Claude Code SDK loop with hooks + custom tools"
```

---

## Task 12: `packages/agent-runner/src/index.ts` — export public API

**Files:**
- Modify: `packages/agent-runner/src/index.ts`

- [ ] **Step 1: Replace the stub**

```typescript
export { runAgent } from './runner.js'
export type { RunAgentOptions } from './types.js'
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/agent-runner && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/agent-runner/src/index.ts
git commit -m "feat(agent-runner): export runAgent and RunAgentOptions from index"
```

---

## Task 13: Wire `/api/approve` to dispatch build tasks

**Files:**
- Modify: `apps/web/src/app/api/approve/route.ts`

Before editing, read `apps/web/src/app/api/mention/route.ts` to confirm the exact shape of `metadata` stored on plan-mode messages (specifically: where `tasks` is stored and its type).

- [ ] **Step 1: Replace approve route**

```typescript
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { Task } from '@squad/types'

interface ApproveBody {
  sessionId: string
  proposalMessageId: string
}

const SHARED_RO_PATHS = ['src/types/shared.ts', 'package.json', 'tsconfig.json', '.env.example']

function partyBase(sessionId: string): string {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'localhost:1999'
  const scheme = host.startsWith('localhost') ? 'http' : 'https'
  return `${scheme}://${host}/parties/main/${sessionId}`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ApproveBody
  try {
    body = await req.json() as ApproveBody
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { sessionId, proposalMessageId } = body
  if (!sessionId || !proposalMessageId) {
    return NextResponse.json({ error: 'sessionId and proposalMessageId required' }, { status: 400 })
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('host_user_id')
    .eq('id', sessionId)
    .single()

  if (!session || session.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Only the session host can approve' }, { status: 403 })
  }

  const { data: proposalMsg } = await supabase
    .from('messages')
    .select('id, mode, metadata')
    .eq('id', proposalMessageId)
    .eq('session_id', sessionId)
    .single()

  if (
    !proposalMsg ||
    proposalMsg.mode !== 'plan' ||
    !proposalMsg.metadata ||
    typeof proposalMsg.metadata !== 'object' ||
    (proposalMsg.metadata as Record<string, unknown>).type !== 'proposal'
  ) {
    return NextResponse.json({ error: 'Invalid proposal message' }, { status: 400 })
  }

  const metadata = proposalMsg.metadata as Record<string, unknown>
  const tasks = (metadata.tasks ?? []) as Task[]

  if (tasks.length === 0) {
    return NextResponse.json({ error: 'Proposal contains no tasks' }, { status: 400 })
  }

  // Build ownership list: all task file patterns + SHARED-RO files
  const ownerships: Array<{ path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }> = []

  for (const task of tasks) {
    for (const pattern of task.fileOwnership) {
      ownerships.push({ path: pattern, agentId: task.assignedAgentId, taskId: task.id, tier: 'owned' })
    }
  }
  for (const path of SHARED_RO_PATHS) {
    ownerships.push({ path, agentId: 'claude-1', taskId: 'shared', tier: 'shared-ro' })
  }

  // Dispatch to SSS
  const dispatchRes = await fetch(`${partyBase(sessionId)}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks, ownerships }),
  })

  if (!dispatchRes.ok) {
    return NextResponse.json({ error: 'SSS dispatch failed' }, { status: 502 })
  }

  // Confirmation message in chat
  const adminSupabase = createAdminClient()
  await adminSupabase.from('messages').insert({
    session_id: sessionId,
    sender_type: 'system',
    content: `Build approved. Dispatching ${tasks.length} task(s) to agents.`,
    metadata: { type: 'build_dispatched', proposalMessageId, taskCount: tasks.length },
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/approve/route.ts
git commit -m "feat(web): wire /api/approve to dispatch tasks + ownerships to SSS"
```

---

## Task 14: Wire squad-skill to handle build_started + run agent

**Files:**
- Modify: `packages/squad-skill/package.json`
- Modify: `packages/squad-skill/src/connect.ts`

- [ ] **Step 1: Update squad-skill package.json — add agent-runner dep**

In `packages/squad-skill/package.json`, update `dependencies`:

```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.39.0",
  "@squad/agent-runner": "workspace:*",
  "partysocket": "^1.0.2",
  "ws": "^8.18.0"
}
```

- [ ] **Step 2: Run pnpm install**

```bash
pnpm install
```
Expected: pnpm-lock.yaml updated, no errors.

- [ ] **Step 3: Replace connect.ts**

```typescript
import WebSocket from 'ws'
import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from '@squad/agent-runner'
import type { Task } from '@squad/types'

interface ConnectOptions {
  sessionId: string
  agentId: string
  apiKey: string
  partyUrl: string
  workdir?: string
  githubToken?: string
}

type IncomingMessage =
  | { type: 'route_to_agent'; agentId: string; content: string; mode: string; requestId: string }
  | { type: 'build_started'; taskGraph: Task[] }
  | { type: string }

export async function connectToSession(opts: ConnectOptions): Promise<void> {
  const { sessionId, agentId, apiKey, partyUrl, workdir = process.cwd(), githubToken } = opts
  const anthropic = new Anthropic({ apiKey })

  // Extract partyHost (strip protocol prefix)
  const partyHost = partyUrl.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '')

  const wsUrl = `${partyUrl}/parties/main/${sessionId}`
  console.log(`Connecting to ${wsUrl} as ${agentId}…`)

  const ws = new WebSocket(wsUrl)

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'register_agent',
      agentId,
      userId: agentId,
      displayName: `Claude (local)`,
    }))
    console.log(`Connected. Listening for messages as ${agentId}`)
  })

  ws.on('message', async (raw) => {
    let msg: IncomingMessage
    try {
      msg = JSON.parse(raw.toString()) as IncomingMessage
    } catch {
      return
    }

    if (msg.type === 'build_started') {
      const myTasks = msg.taskGraph.filter((t: Task) => t.assignedAgentId === agentId)
      if (myTasks.length === 0) {
        console.log(`[${agentId}] build_started — no tasks assigned to me`)
        return
      }
      console.log(`[${agentId}] build_started — ${myTasks.length} task(s) assigned`)

      // Run tasks sequentially (preserves dependsOn ordering)
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

    if (msg.type !== 'route_to_agent' || msg.agentId !== agentId) return

    console.log(`[${agentId}] received ${msg.mode} request: "${msg.content.slice(0, 60)}…"`)

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: msg.mode === 'status' ? 300 : 600,
        system: `You are ${agentId}, a collaborative AI agent in a Squad coding session. Be concise.`,
        messages: [{ role: 'user', content: msg.content }],
      })
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      ws.send(JSON.stringify({
        type: 'agent_response',
        agentId,
        content: text,
        mode: msg.mode,
        requestId: msg.requestId,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      }))
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'agent_error',
        agentId,
        error: err instanceof Error ? err.message : 'Unknown error',
        requestId: msg.requestId,
      }))
    }
  })

  ws.on('close', () => {
    console.log('Disconnected from session')
    process.exit(0)
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message)
    process.exit(1)
  })

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log('\nDisconnecting…')
      ws.close()
      resolve()
    })
  })
}
```

- [ ] **Step 4: Typecheck squad-skill**

```bash
cd packages/squad-skill && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/squad-skill/src/connect.ts packages/squad-skill/package.json pnpm-lock.yaml
git commit -m "feat(squad-skill): handle build_started and execute tasks via runAgent"
```

---

## Task 15: `apps/web/src/app/api/merge/route.ts` — merge trigger

**Files:**
- Create: `apps/web/src/app/api/merge/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { sessionId: string }
  try {
    body = await req.json() as { sessionId: string }
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { sessionId } = body
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('host_user_id, status')
    .eq('id', sessionId)
    .single()

  if (!session || session.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Only the session host can trigger merge' }, { status: 403 })
  }

  if (session.status !== 'building') {
    return NextResponse.json({ error: 'Session is not in building status' }, { status: 409 })
  }

  const adminSupabase = createAdminClient()
  await adminSupabase.from('messages').insert({
    session_id: sessionId,
    sender_type: 'system',
    content: 'Merge sequence triggered. Collecting agent branches…',
    metadata: { type: 'merge_triggered' },
  })

  await supabase.from('sessions').update({ status: 'done' }).eq('id', sessionId)

  // Full merge sequence (Octokit branch merge + PR creation) is Phase 5

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/merge/route.ts
git commit -m "feat(web): add /api/merge route — auth-gated merge trigger"
```

---

## Task 16: End-to-end smoke test

- [ ] **Step 1: Start dev servers**

```bash
pnpm dev
```
Expected: Next.js on port 3000 and Partykit on port 1999 both start without TypeScript errors.

- [ ] **Step 2: Build squad-skill**

```bash
cd packages/squad-skill && pnpm build
```
Expected: `dist/index.js` emitted, no errors.

- [ ] **Step 3: Connect a local agent**

In a separate terminal (replace `<SESSION_ID>` with a real session UUID from Supabase):

```bash
node packages/squad-skill/dist/index.js connect \
  --session <SESSION_ID> \
  --agent claude-2 \
  --party-url ws://localhost:1999
```
Expected console output: `Connected. Listening for messages as claude-2`

- [ ] **Step 4: Approve a proposal in the browser**

1. Open http://localhost:3000, log in, create/join a session
2. Send `@claude-2 build a plan for: create a file hello.txt with content "hello world"`
3. Wait for ProposalCard to appear with one task assigned to `claude-2`
4. Click **Approve**
5. Expected in squad-skill terminal: `[claude-2] build_started — 1 task(s) assigned` then `[claude-2] Starting: ...`

- [ ] **Step 5: Verify SSS state**

```bash
curl "http://localhost:1999/parties/main/<SESSION_ID>/ownership/hello.txt"
```
Expected: `{"owned":true,"agentId":"claude-2","tier":"owned"}`

- [ ] **Step 6: Fix any issues found and commit**

If the `query()` SDK API shape differs from plan, check the actual export:
```bash
node -e "const cc = require('./node_modules/@anthropic-ai/claude-code'); console.log(Object.keys(cc))"
```
Adjust runner.ts `options` object to match the real SDK interface, then re-typecheck and commit with `fix:` prefix.
