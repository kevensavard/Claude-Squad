# API routes

All routes live in `apps/web/src/app/api/`. All routes are TypeScript with full type safety. All routes validate the user's session via Supabase server client before doing anything. All error responses follow the format `{ error: string }`.

---

## Authentication pattern

Every API route starts with this pattern. Never skip it.

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // ... rest of handler
}
```

---

## POST /api/session

Create a new squad session.

**Request body:**
```typescript
{
  name: string          // session display name
  githubRepoUrl?: string  // optional existing repo
}
```

**Response 200:**
```typescript
{
  sessionId: string
  inviteCode: string
  inviteUrl: string     // full URL: {APP_URL}/join/{inviteCode}
}
```

**Logic:**
1. Validate user is authenticated
2. Insert row into `sessions` (host_user_id = user.id)
3. Insert row into `session_members` (user_id = user.id, agent_id = 'claude-u1', is_host = true)
4. Initialize Partykit room by sending a WebSocket message (lazy init — Partykit creates the room on first connection, so just return the session ID)
5. Return session ID and invite URL

---

## GET /api/session/join/[inviteCode]

Validate an invite code and add the user to the session.

**Response 200:**
```typescript
{
  sessionId: string
  sessionName: string
  hostDisplayName: string
  memberCount: number
  agentId: string        // assigned agent ID for this user, e.g. "claude-u2"
}
```

**Response 404:** `{ error: 'Session not found or invite code invalid' }`
**Response 409:** `{ error: 'You are already a member of this session' }`

**Logic:**
1. Look up session by invite_code
2. Check session status is not 'done' or 'archived'
3. Check user is not already a member
4. Assign next available agent_id (u2, u3, u4... — u1 is always the host)
5. Insert into session_members
6. Return session info

---

## POST /api/mention

Handle an @agent mention from the group chat. This is the main routing endpoint.

**Request body:**
```typescript
{
  sessionId: string
  messageId: string     // the Supabase message ID (already inserted by client)
  content: string       // raw message content including @mention
  targetAgentIds: string[]  // parsed mention targets, e.g. ["claude-u1"] or ["all"]
}
```

**Response 200:**
```typescript
{ ok: true }
// Agent response(s) are streamed into the DB via service role, not returned here.
// The client receives them via Supabase Realtime subscription.
```

**Logic:**
1. Validate user is session member
2. Classify intent via Haiku (200ms budget — set a timeout)
3. Fetch context snapshot from SSS: `GET /parties/main/{sessionId}/context-injection/{agentId}`
4. Route by mode:
   - `brainstorm` | `review`: call Claude Sonnet streaming, insert chunks as they arrive into `messages` table (using service role key), final insert marks the message complete
   - `plan`: call Claude Sonnet, parse response as ProposalCard, insert single message with full metadata
   - `build`: return `{ error: 'Use the approve endpoint to start building' }` — build cannot be triggered via mention, only via approve button
   - `status`: query SSS for agent statuses, format and insert as agent message
5. If `targetAgentIds` contains `'all'`: process each agent sequentially, not in parallel

**Streaming agent responses to the DB:**

Do not use Server-Sent Events for this route. Instead, stream directly to the DB:

```typescript
// Insert a placeholder message first
const { data: msg } = await supabase.from('messages').insert({
  session_id: sessionId,
  sender_type: 'agent',
  agent_id: targetAgentId,
  content: '',  // will be updated
  mode: detectedMode,
}).select().single()

// Stream chunks from Claude, accumulate content
let fullContent = ''
for await (const chunk of claudeStream) {
  fullContent += chunk
  // Update every ~500ms or every 200 chars to avoid DB hammering
  // Supabase Realtime will broadcast each update to subscribers
}

// Final update with complete content
await supabase.from('messages')
  .update({ content: fullContent })
  .eq('id', msg.id)
```

Wait — Supabase Realtime only broadcasts on INSERT by default, not UPDATE. To stream content to the UI progressively, use a different approach:

Insert each meaningful chunk as a separate message with `metadata: { streaming: true, streamId: uuid }`. The UI groups them by `streamId` and appends chunks. When the stream ends, insert a final message with `metadata: { streaming: false, streamId, replaces: chunkIds[] }` and the UI consolidates. OR — simpler — use Partykit for streaming (broadcast chunks via SSS WebSocket) and only insert the final complete message to Supabase for persistence. **Use the Partykit approach.** It is simpler and faster.

---

## POST /api/approve

Approve a build proposal and start execution.

**Request body:**
```typescript
{
  sessionId: string
  proposalMessageId: string   // message.id containing the ProposalCard metadata
}
```

**Response 200:**
```typescript
{ ok: true, tasksDispatched: number }
```

**Response 403:** `{ error: 'Only the session host can approve builds' }`
**Response 409:** `{ error: 'A build is already in progress' }`

**Logic:**
1. Validate user is session host
2. Check session status is not already 'building'
3. Fetch proposal from `messages` table by ID, validate metadata.type === 'proposal'
4. Validate the task graph (no ownership conflicts, no circular deps) — rerun validation server-side even though orchestrator did it during plan
5. Write tasks to SSS: `POST /parties/main/{sessionId}/tasks`
6. Write all file ownerships to SSS
7. Update session status to 'building' in Supabase
8. Log decision to SSS: "Build approved by {user.displayName}"
9. Insert system message to group chat: "Build started. {n} tasks dispatched."
10. Spawn agent runners (call `packages/agent-runner` — this is a background job, do not await it in the HTTP handler. Use `waitUntil` in Vercel edge runtime or a Supabase Edge Function for the heavy lifting.)
11. Return `{ ok: true, tasksDispatched: tasks.length }`

---

## POST /api/merge

Trigger the merge sequence. Called by the orchestrator when all tasks are done, not by users directly.

**Request body:**
```typescript
{
  sessionId: string
  agentId: string    // must be 'claude-u1' (orchestrator)
  secret: string     // AGENT_INTERNAL_SECRET env var — prevents users from calling this
}
```

**Response 200:**
```typescript
{ ok: true, prUrl: string }
```

**Logic:**
1. Validate `secret` matches `AGENT_INTERNAL_SECRET` env var
2. Validate session status is 'building'
3. Validate all tasks in SSS are 'done'
4. Run merge sequence (see ORCHESTRATOR.md)
5. Update session status to 'done' in Supabase
6. Flush final token usage from SSS to Supabase token_usage table
7. Return PR URL

---

## POST /api/session/[id]/spec

Update the pinned spec for a session. Called when a user pins a message.

**Request body:**
```typescript
{
  spec: string    // the new spec content
}
```

**Response 200:** `{ ok: true }`

**Logic:**
1. Validate user is session member
2. Send to SSS: `{ type: 'update_spec', spec }`
3. Insert system message: "Spec updated by {user.displayName}"

---

## GET /api/session/[id]/summary

Return session summary for the summary page. Available after session is done.

**Response 200:**
```typescript
{
  session: Session
  members: SessionMember[]
  tokenSummary: {
    userId: string
    displayName: string
    totalTokensIn: number
    totalTokensOut: number
    totalCostUSD: number
  }[]
  tasks: Task[]     // from SSS or a tasks table if we persist them
  prUrl: string | null
}
```
