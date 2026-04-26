# Merge Conflict Feedback Loop + Post-Merge Review — Design

**Date:** 2026-04-25  
**Status:** Approved  
**Scope:** Conflict feedback loop (orchestrator re-dispatch) + post-merge review agent

---

## Problem

When `runMergeSequence` hits a 409, conflict agents are noted in the PR body and the session closes as `done`. There is no automated path back to the orchestrator. Humans must resolve conflicts manually and re-trigger everything.

Publicly committed (Reddit r/ClaudeCode, r/ClaudeAI) to shipping:
1. Conflict feedback loop — orchestrator re-splits conflicting tasks automatically
2. Post-merge review agent — cross-agent consistency check after clean merge

---

## Approach

SSS broadcast + MCP event queue. Fits the existing event-driven pattern (`watch_session()` already handles multiple event types). No polling, no webhooks, no new session statuses beyond keeping `building` during retry rounds.

---

## Types (`@squad/types`)

Add to `ServerMessage` union:
```ts
| { type: 'merge_conflict'; conflictAgents: string[]; round: number; maxRounds: number }
| { type: 'merge_failed'; reason: 'max_rounds_reached'; conflictAgents: string[] }
```

Add to `WatchEvent` union:
```ts
| { type: 'merge_conflict'; conflictAgents: string[]; round: number; maxRounds: number }
```

---

## Data Flow — Conflict Feedback Loop

```
/api/merge detects conflictAgents.length > 0
  → POST SSS /parties/main/{id}/conflict-feedback { conflictAgents }
  → SSS increments conflictRound in storage
  → if round < 3:
      broadcast { type: 'merge_conflict', conflictAgents, round, maxRounds: 3 }
      return { round, limitReached: false }
      session stays 'building'
  → if round >= 3:
      broadcast { type: 'merge_failed', reason: 'max_rounds_reached', conflictAgents }
      set session status = 'done'
      return { limitReached: true }

mcp-server.ts handleServerMessage:
  → 'merge_conflict' → eventQueue.push({ type: 'merge_conflict', ... })

orchestrator watch_session() returns { type: 'merge_conflict', conflictAgents, round }
  → post_message() explaining which agents conflicted and re-split plan
  → dispatch_tasks() with tasks scoped to conflicting agents' work only

user triggers merge again (same UI button)
  → cycle repeats until clean or round limit

on clean merge (conflictAgents.length === 0):
  → POST SSS /parties/main/{id}/merge-complete
  → SSS resets conflictRound to 0
  → session → 'done'
```

---

## Component Changes

### `apps/web/src/app/api/merge/route.ts`
- When `conflictAgents.length > 0`: POST to SSS `/conflict-feedback` instead of just inserting a Supabase message. Do NOT set session to `done`.
- Check response `limitReached`: if true, session is already `done` (SSS handled it); if false, leave `building`.
- When `conflictAgents.length === 0`: POST to SSS `/merge-complete` to reset round counter, then set session to `done` and post `build_summary`.

### `apps/party/src/server.ts`
Add two new `onRequest` branches:

**`POST /conflict-feedback`** — `handleConflictFeedback(req)`:
- Read `conflictRound` from storage (default 0), increment
- If `round < 3`: store updated round, broadcast `merge_conflict`, return `{ round, limitReached: false }`
- If `round >= 3`: broadcast `merge_failed` system message, set session `status = 'done'`, return `{ limitReached: true }`

**`POST /merge-complete`** — `handleMergeComplete()`:
- Reset `conflictRound` to 0 in storage
- Return `{ ok: true }`

### `packages/squad-skill/src/mcp-server.ts`
In `handleServerMessage`:
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

### `packages/squad-skill/src/system-prompt.ts`
Add to orchestrator rules:
```
- When watch_session() returns type: 'merge_conflict', call post_message() to explain
  which agents conflicted and your re-split plan, then call dispatch_tasks() with tasks
  scoped only to the conflicting agents' work. Do not re-dispatch tasks that merged cleanly.
```

### `@squad/types`
Add `merge_conflict` and `merge_failed` to `ServerMessage` union.  
Add `merge_conflict` to `WatchEvent` union.

---

## Post-Merge Review Agent

Runs after clean merge (zero conflicts), before posting `build_summary`, inside `/api/merge`.

**Steps:**
1. `octokit.repos.compareCommits({ base: baseBranch, head: squadBranch })` — fetch unified diff
2. Trim diff to 8,000 chars if needed (stay within Haiku context budget)
3. Call Anthropic API (Haiku) with prompt:
   > "You are a cross-agent consistency reviewer. The following diff was produced by merging multiple agent branches. Identify type mismatches, conflicting API contracts, duplicate function definitions, or naming collisions. Be concise. List findings as bullet points. If nothing looks wrong, say 'No issues found.'"
4. Insert Supabase message: `sender_type: 'system'`, `metadata.type: 'review_complete'`, content = Haiku response
5. Rendered by `BuildSummaryCard` or a new `ReviewCard` component (implementation detail)

**No new agent process.** Pure server-side Anthropic API call. ~2s latency. Uses Haiku (cheap).

---

## Error Handling

- SSS `/conflict-feedback` call fails: log error, fall through to existing Supabase message insert. Do not crash the merge route.
- Anthropic review call fails: skip review, post `build_summary` without it. Non-blocking.
- Round counter storage failure: treat as round 0 (safe default — retries allowed).

---

## Testing

- Unit test `handleConflictFeedback` pure handler (same pattern as `handleOwnershipPost`)
- Unit test MCP server `handleServerMessage` pushes `merge_conflict` to event queue
- Existing merge route tests: add case for conflict path (SSS call, session stays `building`)
- Existing merge route tests: add case for clean merge path (SSS reset, session → `done`, review fires)
