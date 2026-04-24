# Group chat system

## Overview

The group chat is the primary human-facing interface. It is built on Supabase Realtime (Postgres changes subscription). Every message — human or agent — is a row in the `messages` table. The UI subscribes to inserts and renders them in real time.

## Supabase schema

```sql
-- Squad sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid references auth.users not null,
  github_repo_url text,
  invite_code text unique default substring(md5(random()::text), 1, 8),
  status text default 'lobby' check (status in ('lobby','planning','building','done')),
  created_at timestamptz default now()
);

-- Session members
create table session_members (
  session_id uuid references sessions not null,
  user_id uuid references auth.users not null,
  agent_id text not null,  -- e.g. "claude-u1", "claude-u2"
  display_name text not null,
  joined_at timestamptz default now(),
  primary key (session_id, user_id)
);

-- All messages (human + agent)
create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions not null,
  sender_type text not null check (sender_type in ('human','agent','system')),
  user_id uuid references auth.users,   -- null for system messages
  agent_id text,                         -- null for human messages
  content text not null,
  mode text,                             -- null for human; brainstorm/review/plan/build/status for agent
  metadata jsonb default '{}',           -- proposal cards, build summaries, etc.
  created_at timestamptz default now()
);

-- Token usage (written at session end or per-task-completion)
create table token_usage (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions not null,
  user_id uuid references auth.users not null,
  task_id text,
  model text not null,
  tokens_in integer not null,
  tokens_out integer not null,
  recorded_at timestamptz default now()
);
```

Enable Realtime on `messages` table (INSERT only).

## @mention parsing

All group chat input goes through the mention parser before insert.

```typescript
interface ParsedMessage {
  raw: string
  mentions: string[]          // ["claude-1", "claude-2"] or ["all"]
  isAllMention: boolean
  cleanContent: string        // raw with @mentions removed
}

function parseMention(raw: string): ParsedMessage {
  const mentionRegex = /@(claude-\d+|all|agents)/gi
  const mentions: string[] = []
  let match

  while ((match = mentionRegex.exec(raw)) !== null) {
    const tag = match[1].toLowerCase()
    mentions.push(tag === 'agents' ? 'all' : tag)
  }

  return {
    raw,
    mentions: [...new Set(mentions)],
    isAllMention: mentions.includes('all'),
    cleanContent: raw.replace(mentionRegex, '').trim(),
  }
}
```

## Intent classification

Every message with @mentions goes through Haiku classification before routing.

```typescript
type AgentMode = 'brainstorm' | 'review' | 'plan' | 'build' | 'status'

async function classifyIntent(content: string, sessionContext: string): Promise<{
  mode: AgentMode
  confidence: number
}> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    system: `Classify the user's intent in one word. 
Options: brainstorm, review, plan, build, status.
- brainstorm: ideas, opinions, "what do you think", exploration
- review: critique existing content, check something, "does this make sense"  
- plan: "plan this out", "break down", "what tasks", "how would you structure"
- build: "build it", "implement", "write the code", "let's go" (only after explicit readiness)
- status: "what's the status", "how far along", "update me"
Return only JSON: {"mode":"<mode>","confidence":<0.0-1.0>}`,
    messages: [{ role: 'user', content: `Message: "${content}"\nContext: ${sessionContext}` }],
  })

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const parsed = JSON.parse(text)
    return { mode: parsed.mode ?? 'brainstorm', confidence: parsed.confidence ?? 0.5 }
  } catch {
    return { mode: 'brainstorm', confidence: 0.5 }
  }
}
```

If confidence < 0.70, default to `brainstorm`. Never default to `build`.

## Routing by mode

### brainstorm

- Context sent to agent: last 30 messages + project brief (assembled by SSS)
- Agent responds via Claude Sonnet API (streaming)
- Response streamed into group chat as `sender_type: 'agent'`, `mode: 'brainstorm'`
- Token cost attributed to the user who sent the @mention

### review

- Context: last 30 messages + any code block or artifact in the triggering message
- Agent responds with structured feedback
- If message contains a code block, it is extracted and sent as a separate context item

### plan

- Context: last 30 messages + full agreed spec + current task queue state
- Agent (must be orchestrator / claude-1) responds with a `ProposalCard`
- Response is NOT a plain text message — it is stored in `messages.metadata` as a structured object
- UI renders it as an interactive card with Approve / Modify buttons
- No build task is ever created until Approve is clicked

```typescript
interface ProposalCard {
  type: 'proposal'
  tasks: {
    id: string
    title: string
    description: string
    assignedAgentId: string
    fileOwnership: string[]
    dependsOn: string[]
    estimatedTokens: number
  }[]
  totalEstimatedTokens: number
  tokenSplitPreview: Record<string, number>  // userId → estimated tokens
}
```

### build

- Only reachable via Approve button click — never from intent classification alone
- `POST /api/approve` validates the session, retrieves the proposal from the message metadata
- Orchestrator receives the approved task graph and dispatches to SSS
- Each agent runner is spawned
- Group chat receives a `system` message: "Build started. 4 agents working."

### status

- Context: current SSS agent registry + task queue
- Agent responds with a compact summary of all agents' current status
- Capped at 150 tokens per agent to keep it scannable

## @all broadcast

When `@all` or `@agents` is mentioned:
- Each agent responds in turn, not simultaneously (prevents chat flooding)
- Order: orchestrator first, then others in join order
- Each response capped at 200 tokens
- Each response waits for the previous to complete before starting
- Group chat shows a "All agents responding..." indicator during this

## UI message types

The UI must render different message appearances based on `sender_type`, `mode`, and `metadata`:

| sender_type | mode | Render as |
|-------------|------|-----------|
| human | - | Right-aligned bubble, user avatar |
| agent | brainstorm | Left-aligned bubble, agent color, "thinking" icon during stream |
| agent | review | Left-aligned, structured feedback card |
| agent | plan | Full-width ProposalCard with Approve/Modify buttons |
| agent | build | Compact status pill (file written, task progress) |
| agent | status | Compact agent-status grid card |
| system | - | Centered system notice, muted text |

## Approve button behavior

The Approve button in a ProposalCard:
1. Disabled for non-host users (only host can approve) — OR — requires majority vote if `session.approval_mode = 'vote'` (optional feature, implement last)
2. On click: `POST /api/approve { sessionId, proposalMessageId }`
3. API route:
   - Validates user is host (or has vote majority)
   - Retrieves ProposalCard from `messages.metadata`
   - Writes tasks to SSS via Partykit WebSocket
   - Logs decision: "Build approved by {user} at {time}"
   - Spawns agent runners via `packages/agent-runner`
   - Returns `{ ok: true }`
4. Group chat receives system message confirming build start
5. Approve button becomes disabled + shows "Building..." state

## Spec pinning

The group chat has a "pin as spec" action on any message. When used:
- The message content (or a selected portion) is sent as `{ type: 'update_spec', spec }` to SSS
- SSS updates `session.agreedSpec`
- All future context injections include this spec
- A system message appears: "Spec updated by {user}"

This is how the team converts a brainstorm conclusion into the binding project spec.
