# Error handling and resilience

Every failure mode in Squad has a defined handling strategy. Do not invent your own error handling patterns — use what is defined here.

---

## Claude API errors

### Rate limits (429)

```typescript
// packages/agent-runner/src/runner.ts
async function callClaudeWithRetry<T>(
  fn: () => Promise<T>,
  agentId: string,
  sessionId: string,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      if (err.status === 429) {
        const retryAfter = parseInt(err.headers?.['retry-after'] ?? '10', 10)
        const waitMs = retryAfter * 1000 * Math.pow(2, attempt)  // exponential backoff

        await sss.broadcast(sessionId, {
          type: 'agent_message',
          agentId,
          content: `Rate limited. Retrying in ${Math.round(waitMs / 1000)}s... (attempt ${attempt + 1}/${maxRetries})`,
          mode: 'status',
        })

        await sleep(waitMs)
        continue
      }
      throw err  // non-429 errors bubble up immediately
    }
  }
  throw new Error(`Claude API rate limit exceeded after ${maxRetries} retries`)
}
```

### Context overflow

When the Claude Code SDK triggers auto-compaction, the context injection is in the system prompt (not chat history) and survives compaction. Verify this is the case by checking the SDK docs. If the system prompt is dropped on compaction, re-inject it by resuming the session with the system prompt re-set.

The SSS `/context-injection/{agentId}` endpoint is always callable and always returns a fresh injection — agents can request it again at any point.

### Model errors (500, 503)

Insert a system message to group chat: "Claude API is temporarily unavailable. Tasks paused. Will retry in 30s." Then retry after 30 seconds, up to 3 times. After 3 failures, mark affected tasks as `blocked` with reason "Claude API unavailable" and wait for human action.

---

## SSS (Partykit) errors

### Connection lost

Both the Next.js app and the agent runner maintain a WebSocket to Partykit. On disconnect:

```typescript
// Reconnection with exponential backoff
const INITIAL_DELAY = 1000
const MAX_DELAY = 30_000

let delay = INITIAL_DELAY
function reconnect() {
  setTimeout(async () => {
    try {
      await connect()
      delay = INITIAL_DELAY  // reset on success
      // Re-fetch full session state on reconnect
      await rehydrateFromSSS()
    } catch {
      delay = Math.min(delay * 2, MAX_DELAY)
      reconnect()
    }
  }, delay)
}
```

### HTTP endpoint timeout

Agent hooks call SSS HTTP endpoints synchronously and need a response within 200ms. If the SSS HTTP call times out, the hook must fail safe: **block the operation** (not allow it). An ownership check that times out returns `{ decision: 'block', reason: 'SSS timeout — cannot verify ownership. Try again.' }`.

---

## GitHub API errors

### Push failure

If `git push` fails (e.g., auth error, network issue), the agent:
1. Retries up to 3 times with 5s delay
2. If still failing: marks task as `blocked`, broadcasts reason to group chat
3. Does NOT continue writing more files — wait for the push to succeed before proceeding

### Merge conflict at merge time

If GitHub reports a merge conflict during the merge sequence:
1. Do not abort the merge
2. Collect all conflicting file paths
3. Insert a `merge_conflicts` type message to group chat (rendered as `<MergeConflictCard>`)
4. Pause the session — status stays 'building', but no further agent tasks are dispatched
5. Wait for humans to resolve conflicts manually and click "Retry merge"

---

## WebSocket edge cases

### User opens two tabs

Both tabs connect to the same Partykit room. This is fine — Partykit handles multiple connections per user. The UI should detect duplicate sessions (same sessionId + userId) and show a warning: "You have this session open in another tab."

Detect via `localStorage.setItem('squad_session_tab', tabId)` — if the tab ID changes, another tab took over.

### User goes offline (browser disconnect)

If the user's browser disconnects (not the agent — the human):
- Their agent's heartbeat continues as long as the agent runner process is alive (server-side)
- Agent runner is a server-side process — it does not depend on the browser being open
- When the user reconnects, they rejoin the Partykit room and get the full current state
- The agent may have continued working and posting status updates during their absence — these appear in chat history when they reconnect

### Agent runner process crash

If the Vercel function running the agent crashes:
- The heartbeat stops
- SSS detects timeout after 90s and broadcasts `heartbeat_lost`
- Tasks reset to `pending`
- Group chat notified
- User can trigger a restart by clicking "Resume task" on the orphaned task card

To minimize crash impact: agent runners must commit to GitHub frequently (every meaningful file write). Progress is not lost — only the current unsaved work in memory.

---

## Supabase errors

### Insert fails (e.g., RLS violation)

All insertions from agent runners use the service role key and should not hit RLS. If an insert fails:
- Log the error with full context
- Do not retry automatically (inserts are usually idempotent-unsafe)
- Continue the operation — message persistence failure is non-fatal for the agent's core work

### Realtime subscription drops

The client re-subscribes automatically via Supabase client reconnection logic. On reconnect, load the last 50 messages from the DB to fill any gap.

---

## UI error boundaries

Wrap every major UI section in an error boundary:

```typescript
// app/session/[id]/page.tsx
<ErrorBoundary fallback={<ChatError />}>
  <MessageList ... />
</ErrorBoundary>

<ErrorBoundary fallback={<SidebarError />}>
  <PresenceSidebar ... />
</ErrorBoundary>
```

Error boundary fallback components show:
- A short message: "Something went wrong loading this section."
- A "Retry" button that clears the error state
- Never a stack trace in production

---

## Logging

Use structured logging throughout. Every log line includes: `sessionId`, `agentId` (if applicable), `userId` (if applicable), `event`, and relevant context.

```typescript
// lib/logger.ts
export function log(event: string, context: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...context,
  }))
}

// Usage
log('ownership_blocked', { sessionId, agentId, filePath, ownerAgentId })
log('task_complete', { sessionId, agentId, taskId, tokensUsed, durationMs })
log('merge_conflict', { sessionId, conflictingFiles })
```

In production (Vercel), these logs are visible in the Vercel dashboard. In Partykit, logs appear in the Partykit dashboard.
