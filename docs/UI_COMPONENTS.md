# UI components

This doc specifies every component Claude Code needs to build. Read it before writing any JSX. Do not invent component APIs — use what is defined here.

## Design language

- **Minimal, dark-capable.** White backgrounds in light mode, slate-900 in dark. No decorative gradients.
- **Monospace for agent output.** Human messages use the default sans-serif. All agent messages use `font-mono`.
- **Color per agent.** Each `agent_id` maps to a fixed accent color from the palette below. Colors are consistent across all uses (presence sidebar, message border, status pill).
- **Append-only chat.** New messages scroll into view. No pagination — load last 200 messages on mount, stream new ones in via Realtime.

## Agent color palette

Map `agent_id` → color using this fixed table. Add more if needed, cycling from the start.

```typescript
// packages/types/src/agent-colors.ts
export const AGENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'claude-u1': { bg: 'bg-purple-50 dark:bg-purple-950', border: 'border-purple-300 dark:border-purple-700', text: 'text-purple-700 dark:text-purple-300' },
  'claude-u2': { bg: 'bg-teal-50 dark:bg-teal-950',   border: 'border-teal-300 dark:border-teal-700',   text: 'text-teal-700 dark:text-teal-300' },
  'claude-u3': { bg: 'bg-amber-50 dark:bg-amber-950', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-300' },
  'claude-u4': { bg: 'bg-coral-50 dark:bg-rose-950',  border: 'border-rose-300 dark:border-rose-700',   text: 'text-rose-700 dark:text-rose-300' },
}

export function getAgentColor(agentId: string) {
  const keys = Object.keys(AGENT_COLORS)
  const index = parseInt(agentId.replace(/\D/g, ''), 10) % keys.length
  return AGENT_COLORS[keys[index]] ?? AGENT_COLORS['claude-u1']
}
```

---

## Page layout

### `/session/[id]/page.tsx`

Three-column layout on desktop, collapsible to single column on mobile.

```
┌──────────────────────────────────────────────┐
│  Header: session name · status badge          │
├───────────────┬────────────────┬─────────────┤
│  Left sidebar │  Chat main     │  Right panel │
│  (240px)      │  (flex-1)      │  (280px)     │
│               │                │              │
│  Members +    │  MessageList   │  Live task   │
│  agent status │                │  board       │
│               │  MessageInput  │              │
│  Token meters │                │  Build       │
│               │                │  activity    │
└───────────────┴────────────────┴─────────────┘
```

On mobile (< 768px): show only the chat column. Left and right panels accessible via slide-out drawers triggered by icons in the header.

---

## Components

### `<MessageList>`

```typescript
interface MessageListProps {
  sessionId: string
  initialMessages: Message[]  // loaded server-side, passed as prop
}
```

- Renders a vertically scrolling list of messages
- On mount, scrolls to bottom
- New messages arriving via Supabase Realtime subscription are appended and trigger scroll-to-bottom if the user is already within 100px of the bottom (do not force-scroll if they're reading old messages)
- Renders each message via `<MessageItem>` based on `sender_type` and `mode`
- Shows a typing indicator (animated dots) when an agent is streaming. The SSS broadcasts `{ type: 'agent_message', content: '...' }` incrementally — accumulate these into the last message for that agent.

### `<MessageItem>`

```typescript
interface MessageItemProps {
  message: Message
}
```

Routes to the correct sub-component:

```typescript
function MessageItem({ message }: MessageItemProps) {
  if (message.sender_type === 'human') return <HumanMessage message={message} />
  if (message.sender_type === 'system') return <SystemNotice message={message} />
  if (message.mode === 'plan' && message.metadata?.type === 'proposal') {
    return <ProposalCard message={message} />
  }
  if (message.metadata?.type === 'build_summary') {
    return <BuildSummaryCard message={message} />
  }
  if (message.metadata?.type === 'merge_conflicts') {
    return <MergeConflictCard message={message} />
  }
  return <AgentMessage message={message} />
}
```

### `<HumanMessage>`

```
┌─────────────────────────────────────┐
│  [Avatar]  Keven               2:41pm│
│            hey let's build this      │
└─────────────────────────────────────┘
```

- Right-aligned if `message.user_id === currentUserId`, left-aligned otherwise
- Avatar: initials circle (first letter of display name), colored by user index
- Timestamp: relative for < 1hr old ("2 min ago"), absolute otherwise

### `<AgentMessage>`

```
┌─────────────────────────────────────────┐
│ ▌ Claude (Keven)  brainstorm    2:41pm  │
│                                         │
│ I think the biggest risk is the         │
│ Stripe webhook reliability...           │
└─────────────────────────────────────────┘
```

- Left-aligned always
- Left border uses `AGENT_COLORS[agentId].border` (3px, colored)
- Background: `AGENT_COLORS[agentId].bg`
- Header row: agent display name · mode badge · timestamp
- Content rendered as `whitespace-pre-wrap font-mono text-sm`
- Mode badge: small pill, colored by mode:
  - `brainstorm` → blue
  - `review` → amber
  - `plan` → purple
  - `build` → green
  - `status` → gray

### `<ProposalCard>`

Full-width card, not a bubble. Renders after a plan response.

```
┌──────────────────────────────────────────────────────┐
│  Proposed build plan    •  4 tasks  •  est. 18k tokens│
├──────────────────────────────────────────────────────┤
│  Task 1 — Auth module                    claude-u1    │
│  Owns: src/auth/**, src/middleware/auth.ts            │
│  Deps: none                              ~4,200 tok   │
├──────────────────────────────────────────────────────┤
│  Task 2 — API routes                     claude-u2    │
│  Owns: src/routes/**, src/controllers/**              │
│  Deps: Task 1                            ~5,100 tok   │
├──────────────────────────────────────────────────────┤
│  Token split preview:                                 │
│  Keven: ~9,300  •  Marie: ~5,100  •  Alex: ~3,600    │
├──────────────────────────────────────────────────────┤
│  [ Approve & build ]          [ Modify first ]        │
└──────────────────────────────────────────────────────┘
```

```typescript
interface ProposalCardProps {
  message: Message  // message.metadata contains ProposalCard data
  isHost: boolean
  onApprove: (messageId: string) => Promise<void>
  onModify: (messageId: string) => void
}
```

- Approve button: only enabled when `isHost === true`. Shows a spinner during the `onApprove` call. Becomes disabled with "Building..." text once approved.
- Modify button: opens the message input pre-filled with "Modify the plan: " so the user can type their changes and re-trigger the plan flow.
- After approval, the card shows a green "Approved by {name}" banner at the top.

### `<BuildSummaryCard>`

Appears when the merge sequence completes.

```
┌──────────────────────────────────────────────────────┐
│  Build complete                                       │
├──────────────────────────────────────────────────────┤
│  PR #14 — Squad build: invoicing SaaS     → View PR  │
│  4 tasks completed  •  Tests: 12 passed, 0 failed    │
├──────────────────────────────────────────────────────┤
│  Token usage                                         │
│  Keven      9,341 in / 4,102 out    ~$0.08           │
│  Marie      5,088 in / 2,201 out    ~$0.04           │
│  Alex       3,621 in / 1,890 out    ~$0.03           │
│  ────────────────────────────────────────────────    │
│  Total     18,050 in / 8,193 out    ~$0.15           │
└──────────────────────────────────────────────────────┘
```

### `<SystemNotice>`

Centered, muted, no bubble. Used for join/leave events, build started, agent offline, etc.

```
        ─── Keven approved the build plan  2:45pm ───
```

### `<MessageInput>`

```typescript
interface MessageInputProps {
  sessionId: string
  currentUserId: string
  onSend: (content: string) => Promise<void>
}
```

- Single-line input that expands to multi-line on Shift+Enter
- @mention autocomplete: when user types `@`, show a dropdown of available agent IDs in this session
- Autocomplete filters as user types (`@cl` → shows `claude-u1`, `claude-u2`, etc.)
- Send on Enter (not Shift+Enter)
- @mentions are highlighted in the input as purple pills before sending
- Disabled while an agent is responding to prevent duplicate mentions
- Shows `Cmd/Ctrl + Enter` hint when multi-line

### `<PresenceSidebar>`

Left panel. Shows all session members and their agents.

```
Members (3)
──────────────────────
● Keven (host)
  Claude (Keven)  [building]
  ████░░░░  4.2k tok

● Marie
  Claude (Marie)  [idle]
  ██░░░░░░  1.1k tok

● Alex
  Claude (Alex)   [blocked]
  ███░░░░░  2.8k tok
──────────────────────
Session  18.4k / ~$0.15
```

```typescript
interface PresenceSidebarProps {
  members: SessionMember[]
  agentStatuses: Record<string, AgentRecord>  // from SSS via Partykit
  tokenMeters: Record<string, { tokensIn: number; tokensOut: number }>
  currentUserId: string
}
```

- Online indicator: green dot if `lastHeartbeat` within 90s, gray if offline
- Agent status badge: small colored pill — `idle` (gray), `building` (green, pulsing), `blocked` (red), `done` (blue)
- Token bar: shows progress toward a soft 50k token warning threshold
- Clicking a member row expands to show their current task title

### `<TaskBoard>`

Right panel. Shows the task queue from SSS.

```
Tasks (4)
──────────────────────
✓ Auth module          claude-u1
  done

⟳ API routes           claude-u2
  building  ████░░ 60%

⏸ Frontend             claude-u3
  waiting for Task 2

○ DB schema            claude-u4
  pending
──────────────────────
```

```typescript
interface TaskBoardProps {
  tasks: Task[]
  agentStatuses: Record<string, AgentRecord>
}
```

- Status icons: ○ pending, ⟳ in_progress (spinning), ✓ done, ⏸ blocked, ✗ aborted
- In-progress tasks show a progress bar (estimated from `tokensUsed / estimatedTokens`, capped at 95%)
- Clicking a task expands it to show full description and acceptance criteria
- Only visible once build has started (status = 'building')

### `<AgentStatusPill>`

Inline component used in multiple places.

```typescript
interface AgentStatusPillProps {
  status: AgentRecord['status']
  size?: 'sm' | 'md'
}
```

| Status | Color | Animation |
|--------|-------|-----------|
| idle | gray | none |
| brainstorming | blue | none |
| planning | purple | none |
| building | green | pulse |
| blocked | red | none |
| done | teal | none |
| offline | gray | none |

### `<TokenMeter>`

```typescript
interface TokenMeterProps {
  tokensIn: number
  tokensOut: number
  warningThreshold?: number  // default 50_000
}
```

- Compact bar + text: `12.4k · ~$0.04`
- Turns amber when `tokensIn + tokensOut > warningThreshold * 0.8`
- Turns red when over threshold
- Full breakdown on hover/tap: "12,400 in · 4,100 out · ~$0.04 total"

---

## Loading and error states

Every async boundary must have:
- **Loading state:** skeleton loaders (not spinners for content areas). Use `animate-pulse bg-gray-200 dark:bg-gray-700` rectangles that approximate the content shape.
- **Error state:** a muted error message with a retry button. Never a full-page error for a single component failure.
- **Empty state:** meaningful empty state text (not just blank). E.g., MessageList empty: "No messages yet. Start the session by describing what you want to build."

---

## Accessibility

- All interactive elements must be keyboard accessible
- `<button>` for actions, `<a>` for navigation — never `<div onClick>`
- Agent color palette must have ≥ 4.5:1 contrast ratio for text
- Presence indicator (online dot) must have a text alternative (`aria-label="Online"`)
- The @mention autocomplete dropdown must be navigable with arrow keys and closeable with Escape
