# Conflict Feedback Loop + Post-Merge Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When agent branches conflict on merge, automatically notify the orchestrator so it can re-split the conflicting work and re-dispatch; after a clean merge, run a Haiku-powered consistency review.

**Architecture:** `/api/merge` POSTs to a new SSS `/conflict-feedback` endpoint on 409; SSS increments a round counter and broadcasts a `merge_conflict` ServerMessage; the MCP server pushes it to the orchestrator's event queue; `watch_session()` returns a `merge_conflict` WatchEvent and the orchestrator re-dispatches. A max of 3 rounds is enforced in SSS. After a clean merge, `/api/merge` calls the Anthropic API (Haiku) with the branch diff and posts findings as a system message before the build summary.

**Tech Stack:** TypeScript, Partykit (apps/party), Next.js API routes (apps/web), `@octokit/rest`, `@anthropic-ai/sdk`, Vitest

---

## File Map

| File | Change |
|------|--------|
| `packages/types/src/sss.ts` | Add `merge_conflict` to `WatchEvent` union |
| `packages/types/src/messages.ts` | Add `merge_conflict` + `merge_failed` to `ServerMessage` union |
| `packages/types/src/index.ts` | No change needed (already re-exports everything) |
| `apps/party/src/server.ts` | Add `handleConflictFeedback` + `handleMergeComplete` pure fns + two `onRequest` branches |
| `apps/party/src/server.test.ts` | New file — unit tests for the two new pure handlers |
| `packages/squad-skill/src/mcp-server.ts` | Handle `merge_conflict` ServerMessage → push to eventQueue |
| `packages/squad-skill/src/mcp-server.test.ts` | New file — unit test eventQueue push on `merge_conflict` |
| `packages/squad-skill/src/system-prompt.ts` | Add `merge_conflict` handling rule to orchestrator prompt |
| `apps/web/src/lib/github/merge.ts` | No change |
| `apps/web/src/app/api/merge/route.ts` | Call SSS on conflict; call SSS reset + Anthropic review on clean merge |

---

## Task 1: Extend `@squad/types` with conflict types

**Files:**
- Modify: `packages/types/src/sss.ts`
- Modify: `packages/types/src/messages.ts`

- [ ] **Step 1: Add `merge_conflict` to `WatchEvent`**

Open `packages/types/src/sss.ts`. The `WatchEvent` union is at the bottom. Add one variant:

```ts
export type WatchEvent =
  | { type: 'mention'; from: string; content: string; requestId: string }
  | { type: 'build_goal'; from: string; content: string }
  | { type: 'approval_needed'; proposalId: string; agentId: string; summary: string }
  | { type: 'merge_conflict'; conflictAgents: string[]; round: number; maxRounds: number }
  | { type: 'idle' }
```

- [ ] **Step 2: Add `merge_conflict` and `merge_failed` to `ServerMessage`**

Open `packages/types/src/messages.ts`. Add two variants to `ServerMessage`:

```ts
export type ServerMessage =
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
  | { type: 'merge_conflict'; conflictAgents: string[]; round: number; maxRounds: number }
  | { type: 'merge_failed'; reason: 'max_rounds_reached'; conflictAgents: string[] }
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/types && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/sss.ts packages/types/src/messages.ts
git commit -m "feat(types): add merge_conflict WatchEvent and ServerMessage variants"
```

---

## Task 2: Add pure handler functions in SSS server

**Files:**
- Modify: `apps/party/src/server.ts`
- Create: `apps/party/src/server.test.ts`

The SSS uses pure exported functions for all logic so they can be unit-tested without Partykit. Follow the same pattern as `handleOwnershipPost`.

- [ ] **Step 1: Write failing tests for `handleConflictFeedback`**

Create `apps/party/src/server.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { handleConflictFeedback, handleMergeComplete } from './server.js'

describe('handleConflictFeedback', () => {
  it('increments round from 0 and returns limitReached: false when round < 3', () => {
    const result = handleConflictFeedback(0, ['agent-1', 'agent-2'], 3)
    expect(result.round).toBe(1)
    expect(result.limitReached).toBe(false)
    expect(result.conflictAgents).toEqual(['agent-1', 'agent-2'])
  })

  it('returns limitReached: true when round reaches maxRounds', () => {
    const result = handleConflictFeedback(2, ['agent-1'], 3)
    expect(result.round).toBe(3)
    expect(result.limitReached).toBe(true)
  })

  it('returns limitReached: true when round already at maxRounds', () => {
    const result = handleConflictFeedback(3, ['agent-1'], 3)
    expect(result.round).toBe(4)
    expect(result.limitReached).toBe(true)
  })
})

describe('handleMergeComplete', () => {
  it('resets round to 0', () => {
    const result = handleMergeComplete(3)
    expect(result.conflictRound).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/party && npx vitest run src/server.test.ts
```

Expected: FAIL — `handleConflictFeedback is not a function`

- [ ] **Step 3: Implement the two pure handler functions in `apps/party/src/server.ts`**

Add these exports near the top of `server.ts`, after the existing pure handler functions (after `handleTokenUpdate`):

```ts
export function handleConflictFeedback(
  currentRound: number,
  conflictAgents: string[],
  maxRounds: number
): { round: number; limitReached: boolean; conflictAgents: string[] } {
  const round = currentRound + 1
  return { round, limitReached: round >= maxRounds, conflictAgents }
}

export function handleMergeComplete(
  _currentRound: number
): { conflictRound: number } {
  return { conflictRound: 0 }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/party && npx vitest run src/server.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/party/src/server.ts apps/party/src/server.test.ts
git commit -m "feat(sss): add handleConflictFeedback and handleMergeComplete pure handlers"
```

---

## Task 3: Wire `conflict-feedback` and `merge-complete` HTTP endpoints in SSS

**Files:**
- Modify: `apps/party/src/server.ts`

- [ ] **Step 1: Add `conflict-feedback` branch in `onRequest`**

In `server.ts`, find the `onRequest` method. After the existing `if (resource === 'dispatch')` block, add:

```ts
if (resource === 'conflict-feedback') {
  return this.handleConflictFeedbackRequest(req)
}
if (resource === 'merge-complete') {
  return this.handleMergeCompleteRequest()
}
```

- [ ] **Step 2: Add `handleConflictFeedbackRequest` private method**

Add this private method to the `SSSServer` class, after `handleDispatch`:

```ts
private async handleConflictFeedbackRequest(req: Party.Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body: { conflictAgents: string[] }
  try {
    body = await req.json() as { conflictAgents: string[] }
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 })
  }

  const MAX_ROUNDS = 3
  const currentRound = (await this.room.storage.get<number>('conflictRound')) ?? 0
  const result = handleConflictFeedback(currentRound, body.conflictAgents, MAX_ROUNDS)

  await this.room.storage.put('conflictRound', result.round)

  if (!result.limitReached) {
    this.room.broadcast(JSON.stringify({
      type: 'merge_conflict',
      conflictAgents: result.conflictAgents,
      round: result.round,
      maxRounds: MAX_ROUNDS,
    } satisfies ServerMessage))
    return Response.json({ round: result.round, limitReached: false })
  }

  // Round limit reached — close session
  const session = await this.room.storage.get<SessionState>('session')
  if (session && session.status !== 'done') {
    const updated = { ...session, status: 'done' as const }
    await this.room.storage.put('session', updated)
    this.room.broadcast(JSON.stringify({ type: 'session_state', payload: updated } satisfies ServerMessage))
  }
  this.room.broadcast(JSON.stringify({
    type: 'merge_failed',
    reason: 'max_rounds_reached',
    conflictAgents: result.conflictAgents,
  } satisfies ServerMessage))
  return Response.json({ round: result.round, limitReached: true })
}
```

- [ ] **Step 3: Add `handleMergeCompleteRequest` private method**

Add this private method right after `handleConflictFeedbackRequest`:

```ts
private async handleMergeCompleteRequest(): Promise<Response> {
  const current = (await this.room.storage.get<number>('conflictRound')) ?? 0
  const result = handleMergeComplete(current)
  await this.room.storage.put('conflictRound', result.conflictRound)
  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/party && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/party/src/server.ts
git commit -m "feat(sss): wire /conflict-feedback and /merge-complete HTTP endpoints"
```

---

## Task 4: Handle `merge_conflict` in MCP server event queue

**Files:**
- Modify: `packages/squad-skill/src/mcp-server.ts`
- Create: `packages/squad-skill/src/mcp-server.test.ts`

- [ ] **Step 1: Write a failing test**

Create `packages/squad-skill/src/mcp-server.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EventQueue } from './mcp-server.js'

describe('EventQueue merge_conflict handling', () => {
  it('delivers merge_conflict event to next() waiter', async () => {
    const queue = new EventQueue()
    const nextPromise = queue.next(1000)
    queue.push({ type: 'merge_conflict', conflictAgents: ['agent-1'], round: 1, maxRounds: 3 })
    const event = await nextPromise
    expect(event.type).toBe('merge_conflict')
    if (event.type === 'merge_conflict') {
      expect(event.conflictAgents).toEqual(['agent-1'])
      expect(event.round).toBe(1)
      expect(event.maxRounds).toBe(3)
    }
  })

  it('queues merge_conflict event when no waiter is present', async () => {
    const queue = new EventQueue()
    queue.push({ type: 'merge_conflict', conflictAgents: ['agent-2'], round: 2, maxRounds: 3 })
    const event = await queue.next(100)
    expect(event.type).toBe('merge_conflict')
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/squad-skill && npx vitest run src/mcp-server.test.ts
```

Expected: FAIL — TypeScript error: `merge_conflict` not assignable to `WatchEvent` (because types package not updated yet in this context) OR test passes if types already updated. If it passes, skip Step 3.

- [ ] **Step 3: Handle `merge_conflict` in `handleServerMessage`**

In `packages/squad-skill/src/mcp-server.ts`, find the `handleServerMessage` function. After the `if (msg.type === 'agent_message')` block (around line 151), add:

```ts
if (msg.type === 'merge_conflict') {
  eventQueue.push({
    type: 'merge_conflict',
    conflictAgents: msg['conflictAgents'] as string[],
    round: msg['round'] as number,
    maxRounds: msg['maxRounds'] as number,
  })
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/squad-skill && npx vitest run src/mcp-server.test.ts
```

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Typecheck**

```bash
cd packages/squad-skill && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/squad-skill/src/mcp-server.ts packages/squad-skill/src/mcp-server.test.ts
git commit -m "feat(mcp): push merge_conflict server message to orchestrator event queue"
```

---

## Task 5: Update orchestrator system prompt

**Files:**
- Modify: `packages/squad-skill/src/system-prompt.ts`

- [ ] **Step 1: Add `merge_conflict` rule to orchestrator prompt**

In `system-prompt.ts`, find the orchestrator `return` string. Add this rule after the existing "Additional rules:" block:

```ts
return `You are the orchestrator AND a participant in a Claude Squad session.
Session: ${sessionId} | Your agent ID: ${agentId}

Your two responsibilities — in priority order:

1. RESPOND TO @MENTIONS — questions, brainstorming, feedback, code review.
   When watch_session() returns type: 'mention', respond conversationally
   via post_message(). This always takes priority over build work.

2. ORCHESTRATE BUILDS — when watch_session() returns type: 'build_goal',
   call get_session_state() to see connected agents, then dispatch_tasks()
   with a parallel task graph. Assign each task to a specific agent.

Additional rules:
- Call get_pending_approvals() after each watch_session() loop to catch proposals needing sign-off.
- Stay silent during casual conversation — only post_message() when directly relevant.
- Call watch_session() in a loop continuously. It returns after 30s max with type: 'idle' — just loop back.
- When watch_session() returns type: 'merge_conflict': call post_message() to explain which agents
  conflicted (list them) and your re-split plan, then call dispatch_tasks() with new tasks scoped
  ONLY to the conflicting agents' work — do not re-dispatch tasks that already merged cleanly.
  Round ${'{'}event.round{'}'} of ${'{'}event.maxRounds{'}'} — if this is the last round, tell the team manual resolution is needed.`
```

Wait — the system prompt is a plain string, not a template that receives the event at call time. Rewrite the rule without dynamic event fields:

```ts
- When watch_session() returns type: 'merge_conflict': call post_message() explaining which
  agents conflicted (use the conflictAgents list in the event) and your re-split plan. Then call
  dispatch_tasks() with new tasks scoped ONLY to those agents' conflicting work — do not re-dispatch
  tasks that already merged cleanly. If round equals maxRounds, warn the team that this is the
  final attempt and manual resolution may be needed after this round.
```

The full updated orchestrator return in `system-prompt.ts`:

```ts
return `You are the orchestrator AND a participant in a Claude Squad session.
Session: ${sessionId} | Your agent ID: ${agentId}

Your two responsibilities — in priority order:

1. RESPOND TO @MENTIONS — questions, brainstorming, feedback, code review.
   When watch_session() returns type: 'mention', respond conversationally
   via post_message(). This always takes priority over build work.

2. ORCHESTRATE BUILDS — when watch_session() returns type: 'build_goal',
   call get_session_state() to see connected agents, then dispatch_tasks()
   with a parallel task graph. Assign each task to a specific agent.

Additional rules:
- Call get_pending_approvals() after each watch_session() loop to catch proposals needing sign-off.
- Stay silent during casual conversation — only post_message() when directly relevant.
- Call watch_session() in a loop continuously. It returns after 30s max with type: 'idle' — just loop back.
- When watch_session() returns type: 'merge_conflict': call post_message() explaining which agents
  conflicted (use the conflictAgents list from the event) and your re-split plan. Then call
  dispatch_tasks() with new tasks scoped ONLY to those agents' conflicting work — do not re-dispatch
  tasks that already merged cleanly. If round equals maxRounds, warn the team that this is the
  final attempt and manual resolution may be needed.`
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/squad-skill && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/squad-skill/src/system-prompt.ts
git commit -m "feat(orchestrator): add merge_conflict handling rule to system prompt"
```

---

## Task 6: Update `/api/merge` — conflict path

**Files:**
- Modify: `apps/web/src/app/api/merge/route.ts`

This task wires the conflict path: when `conflictAgents.length > 0`, POST to SSS `/conflict-feedback` and leave session as `building` (or let SSS flip it to `done` if limit reached).

- [ ] **Step 1: Replace the conflict handling block in `route.ts`**

Find this block in `route.ts` (around line 95–101):

```ts
if (conflictAgents.length > 0) {
  await adminSupabase.from('messages').insert({
    session_id: sessionId,
    sender_type: 'system',
    content: `Merge conflicts in agents: ${conflictAgents.join(', ')}. Manual resolution required.`,
    metadata: { type: 'merge_conflict', conflictAgents },
  })
}
```

Replace it with:

```ts
if (conflictAgents.length > 0) {
  // Notify SSS — it increments round counter and broadcasts merge_conflict to orchestrator
  const sssUrl = process.env.NEXT_PUBLIC_PARTYKIT_HOST
  if (sssUrl) {
    try {
      const feedbackRes = await fetch(
        `${sssUrl}/parties/main/${sessionId}/conflict-feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conflictAgents }),
        }
      )
      const feedbackData = await feedbackRes.json() as { round: number; limitReached: boolean }
      if (feedbackData.limitReached) {
        // SSS already set session to done and broadcast merge_failed — just return
        return NextResponse.json({ ok: true, prUrl, limitReached: true })
      }
    } catch {
      // Non-fatal — fall through to legacy message insert
      await adminSupabase.from('messages').insert({
        session_id: sessionId,
        sender_type: 'system',
        content: `Merge conflicts in agents: ${conflictAgents.join(', ')}. Orchestrator notified.`,
        metadata: { type: 'merge_conflict', conflictAgents },
      })
    }
  }
  // Session stays 'building' — orchestrator will re-dispatch
  return NextResponse.json({ ok: true, prUrl, conflictAgents })
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/merge/route.ts
git commit -m "feat(merge): POST to SSS conflict-feedback on 409; keep session building"
```

---

## Task 7: Update `/api/merge` — clean merge path (SSS reset + post-merge review)

**Files:**
- Modify: `apps/web/src/app/api/merge/route.ts`

On a clean merge (zero conflicts): reset the SSS round counter, run Haiku review, then post build summary.

- [ ] **Step 1: Add `runPostMergeReview` helper inside `route.ts`**

Add this function before the `POST` export in `route.ts`:

```ts
async function runPostMergeReview({
  octokit,
  owner,
  repo,
  baseBranch,
  squadBranch,
}: {
  octokit: Octokit
  owner: string
  repo: string
  baseBranch: string
  squadBranch: string
}): Promise<string> {
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()

  let diff = ''
  try {
    const { data } = await octokit.repos.compareCommits({
      owner,
      repo,
      base: baseBranch,
      head: squadBranch,
    })
    diff = (data as { files?: Array<{ patch?: string; filename: string }> }).files
      ?.map((f) => `## ${f.filename}\n${f.patch ?? ''}`)
      .join('\n\n')
      .slice(0, 8000) ?? ''
  } catch {
    return 'Could not fetch diff for review.'
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are a cross-agent consistency reviewer. The following diff was produced by merging multiple agent branches into one squad branch. Identify type mismatches, conflicting API contracts, duplicate function definitions, or naming collisions. Be concise. List findings as bullet points. If nothing looks wrong, say "No issues found."\n\n${diff}`,
      },
    ],
  })

  const block = message.content[0]
  return block?.type === 'text' ? block.text : 'Review could not be completed.'
}
```

- [ ] **Step 2: Call `runPostMergeReview` and reset SSS round on clean merge**

Find the section in `route.ts` after the conflict block and before the token summary fetch. Currently it looks like:

```ts
  // Fetch token summary
  const { data: tokenRows } = await adminSupabase
```

Just before that, add the SSS reset and review call (only reached when `conflictAgents.length === 0`):

```ts
  // Reset SSS conflict round counter on clean merge
  const sssUrl = process.env.NEXT_PUBLIC_PARTYKIT_HOST
  if (sssUrl) {
    try {
      await fetch(`${sssUrl}/parties/main/${sessionId}/merge-complete`, { method: 'POST' })
    } catch {
      // non-fatal
    }
  }

  // Post-merge review (Haiku, non-blocking on error)
  if (session.github_repo_url && prUrl) {
    const parsed2 = parseRepoUrl(session.github_repo_url)
    if (parsed2 && githubToken) {
      try {
        const reviewText = await runPostMergeReview({
          octokit,
          owner: parsed2.owner,
          repo: parsed2.repo,
          baseBranch,
          squadBranch: result.squadBranch,
        })
        await adminSupabase.from('messages').insert({
          session_id: sessionId,
          sender_type: 'system',
          content: reviewText,
          metadata: { type: 'review_complete' },
        })
      } catch {
        // non-fatal — skip review
      }
    }
  }
```

Note: `githubToken`, `parsed2` (use `parsed` — it's already in scope), and `result` are all already in scope from earlier in the function. Adjust variable names to use what's already defined:

```ts
  // Reset SSS conflict round counter on clean merge
  const sssUrl = process.env.NEXT_PUBLIC_PARTYKIT_HOST
  if (sssUrl) {
    try {
      await fetch(`${sssUrl}/parties/main/${sessionId}/merge-complete`, { method: 'POST' })
    } catch {
      // non-fatal
    }
  }

  // Post-merge review (Haiku)
  if (session.github_repo_url && prUrl && parsed && githubToken) {
    try {
      const reviewText = await runPostMergeReview({
        octokit,
        owner: parsed.owner,
        repo: parsed.repo,
        baseBranch: 'main',
        squadBranch: result.squadBranch,
      })
      await adminSupabase.from('messages').insert({
        session_id: sessionId,
        sender_type: 'system',
        content: reviewText,
        metadata: { type: 'review_complete' },
      })
    } catch {
      // non-fatal
    }
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. If `Octokit` type import is missing, add `import type { Octokit } from '@octokit/rest'` at the top of `route.ts`.

- [ ] **Step 4: Run existing tests**

```bash
cd apps/web && npx vitest run
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/merge/route.ts
git commit -m "feat(merge): add post-merge Haiku review and SSS round reset on clean merge"
```

---

## Task 8: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
cd apps/web && npx vitest run
cd ../party && npx vitest run
cd ../../packages/squad-skill && npx vitest run
```

Expected: all tests pass across all three packages.

- [ ] **Step 2: Typecheck all packages**

```bash
cd packages/types && npx tsc --noEmit
cd ../squad-skill && npx tsc --noEmit
cd ../../apps/web && npx tsc --noEmit
cd ../party && npx tsc --noEmit
```

Expected: no errors in any package.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address typecheck issues across packages"
```

---

## Self-Review Against Spec

| Spec requirement | Covered in |
|-----------------|------------|
| Session stays `building` on conflict | Task 6 — early return without setting `done` |
| SSS increments round counter | Task 3 — `handleConflictFeedbackRequest` reads/writes `conflictRound` |
| SSS broadcasts `merge_conflict` ServerMessage | Task 3 |
| MCP server pushes to orchestrator eventQueue | Task 4 |
| `watch_session()` returns `merge_conflict` WatchEvent | Task 1 (type) + Task 4 (push) |
| Orchestrator re-dispatches conflicting work only | Task 5 (system prompt rule) |
| Max 3 rounds enforced in SSS | Task 3 — `MAX_ROUNDS = 3`, `limitReached: round >= maxRounds` |
| SSS sets session `done` + broadcasts `merge_failed` at limit | Task 3 |
| SSS round resets to 0 on clean merge | Task 7 — `/merge-complete` POST |
| Post-merge review calls Haiku with diff | Task 7 — `runPostMergeReview` |
| Review posted as `review_complete` system message | Task 7 |
| Review is non-blocking (errors skipped) | Task 7 — try/catch around review |
| SSS reset is non-blocking (errors skipped) | Task 7 — try/catch around fetch |
| Conflict SSS call failure falls back gracefully | Task 6 — try/catch with fallback message insert |
