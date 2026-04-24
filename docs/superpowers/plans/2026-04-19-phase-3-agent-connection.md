# Phase 3 — Agent Connection + Intent Classification + Chat Responses

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** @agent mentions trigger real Claude API responses streamed into the group chat — using each user's own Anthropic API key, via either a web UI input or a local squad-skill CLI process.

**Architecture:** Two connection paths exist side-by-side. Option A: user runs `npx @squad/skill connect` in their terminal — a Node process connects to the Partykit SSS via WebSocket and handles responses with the user's local API key. Option B: user enters their API key in a ConnectionModal in the browser — the key is held in React state only (never written to DB or logs), and each `POST /api/mention` request carries the key for that one call only. Both paths insert agent responses as `messages` rows via the Supabase server client, so Realtime delivers them to all participants.

**Tech Stack:** Next.js 15 (latest) API routes, Anthropic SDK (`@anthropic-ai/sdk`), `@vercel/functions` (`waitUntil`), Claude Haiku (intent), Claude Sonnet (responses), Partykit WebSocket, Supabase Realtime, `partysocket` npm package, `@octokit/rest` for GitHub, Tailwind CSS v4, Vitest + `@testing-library/react` (jsdom)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/app/new/page.tsx` | Add optional GitHub repo URL input |
| Modify | `apps/web/src/app/api/session/route.ts` | Remove debug `detail` field |
| Create | `apps/web/src/app/api/mention/route.ts` | Receive @mention, classify, route, respond |
| Create | `apps/web/src/lib/anthropic/classify.ts` | Haiku intent classification |
| Create | `apps/web/src/lib/anthropic/respond.ts` | Brainstorm + review mode responses |
| Create | `apps/web/src/lib/anthropic/plan.ts` | Plan mode — orchestrator decomposition |
| Create | `apps/web/src/hooks/useAgentKey.ts` | Per-session API key React state |
| Create | `apps/web/src/components/onboarding/ConnectionModal.tsx` | API key entry + squad-skill instructions |
| Modify | `apps/web/src/components/session/SessionLayout.tsx` | Mount ConnectionModal, pass apiKey down |
| Modify | `apps/web/src/components/chat/MessageInput.tsx` | Route @mention messages through /api/mention |
| Modify | `apps/web/src/components/chat/MessageList.tsx` | Render AgentMessage + ProposalCard |
| Modify | `apps/web/src/components/chat/AgentMessage.tsx` | Extend existing Phase 2 component — add plan mode + ProposalCard integration |
| Create | `apps/web/src/components/chat/ProposalCard.tsx` | Interactive plan card with Approve button |
| Create | `apps/web/src/app/api/approve/route.ts` | Validate approval, write to SSS, return ok |
| Create | `packages/squad-skill/package.json` | npm package manifest |
| Create | `packages/squad-skill/src/index.ts` | CLI entry point (`squad-skill connect`) |
| Create | `packages/squad-skill/src/connect.ts` | WebSocket loop — SSS listen + respond |
| Create | `packages/squad-skill/tsconfig.json` | TypeScript config for the package |

---

### Task 0: Upgrade Next.js + install testing deps

**Files:**
- Modify: `apps/web/package.json` (via pnpm commands)
- Modify: `apps/web/vitest.config.ts`

- [ ] **Step 1: Upgrade Next.js to latest**

```bash
cd apps/web && pnpm add next@latest
```

Expected: `package.json` updates Next.js to `15.3.x` or higher. No breaking changes for App Router projects at this version boundary.

- [ ] **Step 2: Verify the app still starts**

```bash
cd apps/web && pnpm build 2>&1 | tail -20
```

Expected: Build completes with no errors. Fix any deprecation warnings before continuing.

- [ ] **Step 3: Install Vitest + testing-library**

```bash
cd apps/web && pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom
```

Expected: All packages added to `devDependencies`.

- [ ] **Step 4: Update vitest.config.ts to use jsdom**

Replace the full content of `apps/web/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@squad/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
})
```

- [ ] **Step 5: Smoke-test vitest runs**

```bash
cd apps/web && pnpm test --run
```

Expected: Test runner starts and exits cleanly (0 tests if none exist yet, no config errors).

- [ ] **Step 6: Install @vercel/functions**

```bash
cd apps/web && pnpm add @vercel/functions
```

Expected: Package added to `dependencies`. Provides `waitUntil()` to defer background work past the Vercel response boundary without the process being killed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts
git commit -m "chore: upgrade next.js to latest, add vitest + testing-library + @vercel/functions"
```

---

### Task 1: GitHub repo field in session creation

**Files:**
- Modify: `apps/web/src/app/new/page.tsx`
- Modify: `apps/web/src/app/api/session/route.ts` (remove debug `detail` field)

- [ ] **Step 1: Remove `detail` from the session API error responses**

In `apps/web/src/app/api/session/route.ts`, remove the `detail` field from both error responses:

```typescript
// Line 39 — change:
return NextResponse.json({ error: 'Failed to create session', detail: sessionError?.message }, { status: 500 })
// to:
return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })

// Line 62 — change:
return NextResponse.json({ error: 'Failed to add host to session', detail: memberError.message }, { status: 500 })
// to:
return NextResponse.json({ error: 'Failed to add host to session' }, { status: 500 })
```

- [ ] **Step 2: Add GitHub repo URL field to `new/page.tsx`**

Replace the full file content:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewSessionPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [githubRepoUrl, setGithubRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const body: { name: string; githubRepoUrl?: string } = { name }
    if (githubRepoUrl.trim()) body.githubRepoUrl = githubRepoUrl.trim()

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json() as { sessionId?: string; error?: string }

    if (!res.ok || !data.sessionId) {
      setError(data.error ?? 'Something went wrong')
      setLoading(false)
      return
    }

    router.push(`/session/${data.sessionId}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-md space-y-6 p-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">New session</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Give your squad session a name. You&apos;ll get an invite link to share.
        </p>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Session name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Invoicing SaaS MVP"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              GitHub repo URL <span className="text-slate-400">(optional — can add later)</span>
            </label>
            <input
              type="url"
              placeholder="https://github.com/you/your-repo"
              value={githubRepoUrl}
              onChange={(e) => setGithubRepoUrl(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || name.trim().length === 0}
            className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating…' : 'Create session'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Run: `cd apps/web && pnpm dev`

Navigate to `/new`. Verify the GitHub URL field appears below the session name field. Create a session without a GitHub URL — should work normally. Create a session with `https://github.com/test/repo` — should work and redirect to session.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/new/page.tsx apps/web/src/app/api/session/route.ts
git commit -m "feat: add github repo url field to session creation"
```

---

### Task 2: useAgentKey hook + ConnectionModal

**Files:**
- Create: `apps/web/src/hooks/useAgentKey.ts`
- Create: `apps/web/src/components/onboarding/ConnectionModal.tsx`

- [ ] **Step 1: Write failing test for useAgentKey**

Create `apps/web/src/hooks/useAgentKey.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useAgentKey } from './useAgentKey'

describe('useAgentKey', () => {
  it('starts with no key', () => {
    const { result } = renderHook(() => useAgentKey())
    expect(result.current.apiKey).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })

  it('stores a key when setKey is called', () => {
    const { result } = renderHook(() => useAgentKey())
    act(() => { result.current.setKey('sk-ant-test123') })
    expect(result.current.apiKey).toBe('sk-ant-test123')
    expect(result.current.isConnected).toBe(true)
  })

  it('clears the key when clearKey is called', () => {
    const { result } = renderHook(() => useAgentKey())
    act(() => { result.current.setKey('sk-ant-test123') })
    act(() => { result.current.clearKey() })
    expect(result.current.apiKey).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })
})
```

Run: `cd apps/web && pnpm test --run hooks/useAgentKey`
Expected: FAIL (module not found)

- [ ] **Step 2: Implement useAgentKey**

Create `apps/web/src/hooks/useAgentKey.ts`:

```typescript
'use client'

import { useState, useCallback } from 'react'

interface AgentKeyState {
  apiKey: string | null
  isConnected: boolean
  setKey: (key: string) => void
  clearKey: () => void
}

export function useAgentKey(): AgentKeyState {
  const [apiKey, setApiKey] = useState<string | null>(null)

  const setKey = useCallback((key: string) => {
    setApiKey(key.trim() || null)
  }, [])

  const clearKey = useCallback(() => {
    setApiKey(null)
  }, [])

  return {
    apiKey,
    isConnected: apiKey !== null,
    setKey,
    clearKey,
  }
}
```

Run: `cd apps/web && pnpm test --run hooks/useAgentKey`
Expected: PASS (3 tests)

- [ ] **Step 3: Create ConnectionModal**

Create `apps/web/src/components/onboarding/ConnectionModal.tsx`:

```tsx
'use client'

import { useState } from 'react'

interface ConnectionModalProps {
  agentId: string
  onKeySubmit: (key: string) => void
  onClose: () => void
}

export function ConnectionModal({ agentId, onKeySubmit, onClose }: ConnectionModalProps) {
  const [tab, setTab] = useState<'key' | 'skill'>('key')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmitKey(e: React.FormEvent) {
    e.preventDefault()
    if (!key.startsWith('sk-ant-')) {
      setError('Key must start with sk-ant-')
      return
    }
    onKeySubmit(key.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Connect {agentId}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          Choose how your agent responds. Your API key is never saved — it stays in your browser tab only.
        </p>

        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setTab('key')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'key'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            API key in browser
          </button>
          <button
            onClick={() => setTab('skill')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'skill'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Local Claude Code (squad-skill)
          </button>
        </div>

        {tab === 'key' && (
          <form onSubmit={handleSubmitKey} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Anthropic API key
              </label>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={key}
                onChange={(e) => { setKey(e.target.value); setError(null) }}
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                autoFocus
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
            <p className="text-xs text-slate-400">
              Used only for this session. Not stored anywhere. Costs appear on your Anthropic bill.
            </p>
            <button
              type="submit"
              disabled={key.length < 10}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Connect with this key
            </button>
          </form>
        )}

        {tab === 'skill' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Run this in your terminal. Your local Claude Code will connect as <strong>{agentId}</strong>:
            </p>
            <pre className="bg-slate-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto select-all">
              {`npx @squad/skill connect --agent ${agentId} --session ${window?.location?.pathname?.split('/').pop() ?? 'SESSION_ID'}`}
            </pre>
            <p className="text-xs text-slate-400">
              Your Claude Code API key is used automatically. Costs appear on your Anthropic bill.
            </p>
            <p className="text-xs text-slate-400">
              Once connected, the agent indicator next to your name will turn green.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              I&apos;ll set it up now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useAgentKey.ts apps/web/src/hooks/useAgentKey.test.ts apps/web/src/components/onboarding/ConnectionModal.tsx
git commit -m "feat: add useAgentKey hook and ConnectionModal for agent connection"
```

---

### Task 3: Wire ConnectionModal into SessionLayout

**Files:**
- Modify: `apps/web/src/components/session/SessionLayout.tsx`

- [ ] **Step 1: Update SessionLayout to mount ConnectionModal and expose apiKey**

Replace the full content of `apps/web/src/components/session/SessionLayout.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { SessionMember, Message, Session } from '@/types/database'
import { MessageList } from '../chat/MessageList'
import { MessageInput } from '../chat/MessageInput'
import { PresenceSidebar } from '../sidebar/PresenceSidebar'
import { ConnectionModal } from '../onboarding/ConnectionModal'
import { usePartykitSession } from '@/hooks/usePartykitSession'
import { useAgentKey } from '@/hooks/useAgentKey'
import { createClient } from '@/lib/supabase/client'

interface SessionLayoutProps {
  session: Session
  members: SessionMember[]
  initialMessages: Message[]
  currentUserId: string
  currentMember: SessionMember
}

export function SessionLayout({
  session,
  members,
  initialMessages,
  currentUserId,
  currentMember,
}: SessionLayoutProps) {
  const { agents, connected } = usePartykitSession(session.id, currentMember.agent_id)
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([])
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const { apiKey, isConnected, setKey } = useAgentKey()

  const availableAgentIds = members.map((m) => m.agent_id)

  async function handleSend(content: string) {
    const optimistic: Message = {
      id: crypto.randomUUID(),
      session_id: session.id,
      sender_type: 'human',
      user_id: currentUserId,
      agent_id: null,
      content,
      mode: null,
      metadata: {},
      created_at: new Date().toISOString(),
    }
    setOptimisticMessages((prev) => [...prev, optimistic])

    const hasMention = /@(claude-u\d+|all|agents)/i.test(content)

    if (hasMention) {
      const res = await fetch('/api/mention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          content,
          apiKey: apiKey ?? undefined,
        }),
      })
      if (res.ok) {
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      }
    } else {
      const supabase = createClient()
      const { data } = await supabase.from('messages').insert({
        session_id: session.id,
        sender_type: 'human',
        user_id: currentUserId,
        content,
        metadata: {},
      }).select().single()

      if (data) {
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      }
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
        <h1 className="font-semibold text-slate-900 dark:text-white truncate">{session.name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          session.status === 'building'
            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
        }`}>
          {session.status}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowConnectionModal(true)}
            className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
              isConnected
                ? 'border-green-300 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                : 'border-slate-300 text-slate-600 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600'
            }`}
          >
            {isConnected ? `● ${currentMember.agent_id} connected` : `Connect ${currentMember.agent_id}`}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <PresenceSidebar
          members={members}
          agentStatuses={agents}
          tokenMeters={{}}
          currentUserId={currentUserId}
          connected={connected}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          <MessageList
            sessionId={session.id}
            currentUserId={currentUserId}
            initialMessages={[...initialMessages, ...optimisticMessages]}
            currentMember={currentMember}
            members={members}
            sessionId_for_approve={session.id}
            isHost={session.host_user_id === currentUserId}
          />
          <MessageInput
            sessionId={session.id}
            currentUserId={currentUserId}
            availableAgentIds={availableAgentIds}
            onSend={handleSend}
          />
        </main>

        <aside className="w-72 border-l border-slate-200 dark:border-slate-700 p-3 hidden lg:block">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Tasks
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Tasks appear here after the build starts.
          </p>
        </aside>
      </div>

      {showConnectionModal && (
        <ConnectionModal
          agentId={currentMember.agent_id}
          onKeySubmit={setKey}
          onClose={() => setShowConnectionModal(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

The session header should now show a "Connect claude-u1" button. Clicking it opens the modal with two tabs. Entering a key and submitting should update the button to "● claude-u1 connected".

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/session/SessionLayout.tsx
git commit -m "feat: wire ConnectionModal into SessionLayout with apiKey state"
```

---

### Task 4: Intent classification

**Files:**
- Create: `apps/web/src/lib/anthropic/classify.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/lib/anthropic/classify.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"mode":"brainstorm","confidence":0.9}' }],
      }),
    },
  })),
}))

import { classifyIntent } from './classify'

describe('classifyIntent', () => {
  it('returns parsed mode and confidence', async () => {
    const result = await classifyIntent('what do you think about React?', '', 'sk-ant-test')
    expect(result.mode).toBe('brainstorm')
    expect(result.confidence).toBe(0.9)
  })

  it('falls back to brainstorm on bad JSON', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'not json' }],
    })
    ;(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      messages: { create: mockCreate },
    }))
    const result = await classifyIntent('hmm', '', 'sk-ant-test')
    expect(result.mode).toBe('brainstorm')
    expect(result.confidence).toBe(0.5)
  })
})
```

Run: `cd apps/web && pnpm test --run lib/anthropic/classify`
Expected: FAIL (module not found)

- [ ] **Step 2: Implement classifyIntent**

Create `apps/web/src/lib/anthropic/classify.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'

export type AgentMode = 'brainstorm' | 'review' | 'plan' | 'build' | 'status'

export async function classifyIntent(
  content: string,
  sessionContext: string,
  apiKey: string,
): Promise<{ mode: AgentMode; confidence: number }> {
  const anthropic = new Anthropic({ apiKey })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    system: `Classify the user's intent in one word.
Options: brainstorm, review, plan, build, status.
- brainstorm: ideas, opinions, "what do you think", exploration
- review: critique existing content, check something, "does this make sense"
- plan: "plan this out", "break down", "what tasks", "how would you structure"
- build: "build it", "implement", "write the code", "let's go" (only after explicit plan approval — never guess this)
- status: "what's the status", "how far along", "update me"
Return only JSON: {"mode":"<mode>","confidence":<0.0-1.0>}`,
    messages: [{ role: 'user', content: `Message: "${content}"\nContext: ${sessionContext}` }],
  })

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const parsed = JSON.parse(text) as { mode?: AgentMode; confidence?: number }
    const mode = parsed.mode ?? 'brainstorm'
    const confidence = parsed.confidence ?? 0.5
    // Never auto-classify as build — only reachable via Approve button
    return { mode: mode === 'build' ? 'brainstorm' : mode, confidence }
  } catch {
    return { mode: 'brainstorm', confidence: 0.5 }
  }
}
```

Run: `cd apps/web && pnpm test --run lib/anthropic/classify`
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/anthropic/classify.ts apps/web/src/lib/anthropic/classify.test.ts
git commit -m "feat: add Haiku intent classifier"
```

---

### Task 5: Brainstorm + review mode responses

**Files:**
- Create: `apps/web/src/lib/anthropic/respond.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/lib/anthropic/respond.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Here is my brainstorm response.' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  })),
}))

import { generateResponse } from './respond'

describe('generateResponse', () => {
  it('returns content and usage', async () => {
    const result = await generateResponse({
      mode: 'brainstorm',
      content: 'What do you think about Postgres?',
      chatContext: [],
      agentId: 'claude-u1',
      apiKey: 'sk-ant-test',
    })
    expect(result.text).toBe('Here is my brainstorm response.')
    expect(result.tokensIn).toBe(100)
    expect(result.tokensOut).toBe(50)
  })
})
```

Run: `cd apps/web && pnpm test --run lib/anthropic/respond`
Expected: FAIL (module not found)

- [ ] **Step 2: Implement generateResponse**

Create `apps/web/src/lib/anthropic/respond.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { AgentMode } from './classify'
import type { Message } from '@/types/database'

interface RespondOptions {
  mode: AgentMode
  content: string
  chatContext: Message[]
  agentId: string
  apiKey: string
}

interface ResponseResult {
  text: string
  tokensIn: number
  tokensOut: number
}

const MODE_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  brainstorm: `You are ${'{agentId}'}, a collaborative AI agent in a Squad coding session. Your role is to brainstorm, share opinions, and explore ideas with the team. Be concise and concrete — 2-4 paragraphs max. Never write code unless explicitly asked.`,
  review: `You are ${'{agentId}'}, reviewing content in a Squad coding session. Give structured, actionable feedback. If reviewing code, point out specific issues with line references. Be direct.`,
  plan: `You are ${'{agentId}'}, the orchestrator in a Squad coding session. Decompose the request into a concrete task plan.`,
  build: `You are ${'{agentId}'}, reporting build progress.`,
  status: `You are ${'{agentId}'}, providing a status update. Be concise — one line per agent.`,
}

export async function generateResponse(opts: RespondOptions): Promise<ResponseResult> {
  const { mode, content, chatContext, agentId, apiKey } = opts
  const anthropic = new Anthropic({ apiKey })

  const systemPrompt = MODE_SYSTEM_PROMPTS[mode].replace('{agentId}', agentId)

  const contextMessages: Anthropic.MessageParam[] = chatContext.slice(-30).map((m) => ({
    role: m.sender_type === 'human' ? 'user' : 'assistant',
    content: m.content,
  }))

  // Extract code block from content for review mode
  const codeBlock = mode === 'review' ? extractCodeBlock(content) : null
  const userContent = codeBlock
    ? `${content}\n\nCode to review:\n\`\`\`\n${codeBlock}\n\`\`\``
    : content

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: mode === 'status' ? 300 : mode === 'brainstorm' ? 600 : 1000,
    system: systemPrompt,
    messages: [
      ...contextMessages,
      { role: 'user', content: userContent },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return {
    text,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  }
}

function extractCodeBlock(content: string): string | null {
  const match = /```[\w]*\n([\s\S]+?)```/.exec(content)
  return match?.[1] ?? null
}
```

Run: `cd apps/web && pnpm test --run lib/anthropic/respond`
Expected: PASS (1 test)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/anthropic/respond.ts apps/web/src/lib/anthropic/respond.test.ts
git commit -m "feat: add brainstorm/review response generator"
```

---

### Task 6: Plan mode — orchestrator decomposition

**Files:**
- Create: `apps/web/src/lib/anthropic/plan.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/lib/anthropic/plan.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockProposal = {
  type: 'proposal',
  tasks: [{
    id: 'task-1',
    title: 'Build auth',
    description: 'Implement user authentication',
    assignedAgentId: 'claude-u1',
    fileOwnership: ['src/auth/**'],
    dependsOn: [],
    estimatedTokens: 3000,
  }],
  totalEstimatedTokens: 3000,
  tokenSplitPreview: { 'user-1': 3000 },
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockProposal) }],
        usage: { input_tokens: 500, output_tokens: 200 },
      }),
    },
  })),
}))

import { decomposeSpec } from './plan'

describe('decomposeSpec', () => {
  it('returns a ProposalCard', async () => {
    const result = await decomposeSpec({
      spec: 'Build an auth system',
      agents: [{ agentId: 'claude-u1', userId: 'user-1' }],
      chatContext: 'some context',
      apiKey: 'sk-ant-test',
    })
    expect(result.type).toBe('proposal')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].assignedAgentId).toBe('claude-u1')
  })
})
```

Run: `cd apps/web && pnpm test --run lib/anthropic/plan`
Expected: FAIL (module not found)

- [ ] **Step 2: Implement decomposeSpec**

Create `apps/web/src/lib/anthropic/plan.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'

export interface ProposalTask {
  id: string
  title: string
  description: string
  assignedAgentId: string
  fileOwnership: string[]
  dependsOn: string[]
  estimatedTokens: number
}

export interface ProposalCard {
  type: 'proposal'
  tasks: ProposalTask[]
  totalEstimatedTokens: number
  tokenSplitPreview: Record<string, number>
}

interface DecomposeOptions {
  spec: string
  agents: { agentId: string; userId: string }[]
  chatContext: string
  apiKey: string
}

export async function decomposeSpec(opts: DecomposeOptions): Promise<ProposalCard> {
  const { spec, agents, chatContext, apiKey } = opts
  const anthropic = new Anthropic({ apiKey })

  const systemPrompt = `You are the orchestrator for a multi-agent coding session.
You have ${agents.length} agents available: ${agents.map((a) => a.agentId).join(', ')}.

Decompose the spec into tasks buildable in parallel.

Rules:
1. No two tasks can own the same file path or glob.
2. File ownership must be exhaustive — every file created or modified must be in exactly one task's fileOwnership.
3. These are always SHARED-RO (orchestrator owns): src/types/shared.ts, package.json, tsconfig.json, .env.example
4. dependsOn must reference valid task ids within this proposal.
5. Estimate tokens per task (range: 2000–8000).
6. Assign tasks evenly across agents.
7. tokenSplitPreview maps userId to estimated tokens for that user's agent.

Return ONLY valid JSON matching this TypeScript type:
{
  type: 'proposal',
  tasks: Array<{
    id: string,
    title: string,
    description: string,
    assignedAgentId: string,
    fileOwnership: string[],
    dependsOn: string[],
    estimatedTokens: number,
  }>,
  totalEstimatedTokens: number,
  tokenSplitPreview: Record<string, number>,
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Spec:\n${spec}\n\nChat context:\n${chatContext}\n\nAgents:\n${JSON.stringify(agents, null, 2)}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const proposal = JSON.parse(text) as ProposalCard
  return proposal
}
```

Run: `cd apps/web && pnpm test --run lib/anthropic/plan`
Expected: PASS (1 test)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/anthropic/plan.ts apps/web/src/lib/anthropic/plan.test.ts
git commit -m "feat: add orchestrator plan decomposition"
```

---

### Task 7: /api/mention route

**Files:**
- Create: `apps/web/src/app/api/mention/route.ts`

This route: validates the user, inserts the human message, then for each @mentioned agent classifies intent and generates a response using that agent's owner's API key.

**Note:** For Phase 3, we only support Option B (API key in request body). Option A (squad-skill) routing is added in Task 11.

- [ ] **Step 1: Install Anthropic SDK**

```bash
cd apps/web && pnpm add @anthropic-ai/sdk
```

Expected output: Package added to `apps/web/package.json`. (Skip if already installed from Task 0.)

- [ ] **Step 2: Create the mention route**

Create `apps/web/src/app/api/mention/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { classifyIntent } from '@/lib/anthropic/classify'
import { generateResponse } from '@/lib/anthropic/respond'
import { decomposeSpec } from '@/lib/anthropic/plan'

interface MentionBody {
  sessionId: string
  content: string
  apiKey?: string
}

function parseMentions(content: string): string[] {
  const regex = /@(claude-u\d+|all|agents)/gi
  const found: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    const tag = match[1].toLowerCase()
    found.push(tag === 'agents' ? 'all' : tag)
  }
  return [...new Set(found)]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: MentionBody
  try {
    body = await req.json() as MentionBody
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { sessionId, content, apiKey } = body

  if (!sessionId || !content) {
    return NextResponse.json({ error: 'sessionId and content required' }, { status: 400 })
  }

  // Validate user is a member of this session
  const { data: currentMember } = await supabase
    .from('session_members')
    .select('agent_id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!currentMember) {
    return NextResponse.json({ error: 'Not a session member' }, { status: 403 })
  }

  // Insert the human message
  const { data: humanMsg, error: insertError } = await supabase
    .from('messages')
    .insert({
      session_id: sessionId,
      sender_type: 'human',
      user_id: user.id,
      content,
      metadata: {},
    })
    .select()
    .single()

  if (insertError || !humanMsg) {
    return NextResponse.json({ error: 'Failed to insert message' }, { status: 500 })
  }

  // Parse which agents were mentioned
  const mentions = parseMentions(content)

  // Load all session members to resolve @all
  const { data: members } = await supabase
    .from('session_members')
    .select('agent_id, user_id')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })

  const allAgents = members ?? []

  const targetAgentIds = mentions.includes('all')
    ? allAgents.map((m) => m.agent_id)
    : mentions

  if (targetAgentIds.length === 0 || !apiKey) {
    // No agents to route to, or no API key — human message already inserted
    return NextResponse.json({ ok: true, messageId: humanMsg.id })
  }

  // Load recent context
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(30)

  const chatContext = (recentMessages ?? []).reverse()

  // Process agents after the response is sent — waitUntil keeps the Vercel function
  // alive past the HTTP response boundary so the LLM calls aren't killed mid-flight.
  waitUntil((async () => {
    for (const agentId of targetAgentIds) {
      try {
        // Classify intent
        const cleanContent = content.replace(/@(claude-u\d+|all|agents)/gi, '').trim()
        const { mode, confidence } = await classifyIntent(cleanContent, '', apiKey)
        const resolvedMode = confidence >= 0.70 ? mode : 'brainstorm'

        if (resolvedMode === 'plan') {
          const spec = cleanContent
          const agentsForPlan = allAgents.map((m) => ({ agentId: m.agent_id, userId: m.user_id }))
          const proposal = await decomposeSpec({
            spec,
            agents: agentsForPlan,
            chatContext: chatContext.map((m) => m.content).join('\n'),
            apiKey,
          })

          await supabase.from('messages').insert({
            session_id: sessionId,
            sender_type: 'agent',
            agent_id: agentId,
            content: `Here is my proposed plan for: "${spec}"`,
            mode: 'plan',
            metadata: proposal,
          })
        } else {
          const { text } = await generateResponse({
            mode: resolvedMode,
            content: cleanContent,
            chatContext,
            agentId,
            apiKey,
          })

          await supabase.from('messages').insert({
            session_id: sessionId,
            sender_type: 'agent',
            agent_id: agentId,
            content: text,
            mode: resolvedMode,
            metadata: {},
          })
        }
      } catch (err) {
        // Insert error notice so users see the failure in chat
        await supabase.from('messages').insert({
          session_id: sessionId,
          sender_type: 'system',
          content: `${agentId} failed to respond: ${err instanceof Error ? err.message : 'Unknown error'}`,
          metadata: {},
        })
      }
    }
  })())

  return NextResponse.json({ ok: true, messageId: humanMsg.id })
}
```

- [ ] **Step 3: Verify manually**

With `pnpm dev` running:

1. Open a session, enter your API key via ConnectionModal
2. Type `@claude-u1 what do you think about using Next.js vs Remix?` and send
3. The human message should appear immediately (via realtime)
4. Within a few seconds, a claude-u1 response should appear in the chat

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/mention/route.ts
git commit -m "feat: add /api/mention route with intent classification and agent responses"
```

---

### Task 8: Reconcile AgentMessage — extend Phase 2 component

**Files:**
- Modify: `apps/web/src/components/chat/AgentMessage.tsx`

The Phase 2 component already exists and uses `getAgentColor` from `@squad/types` plus a `border-l-4` card layout with timestamps. **Do not rewrite it** — extend it to add the Phase 3 mode labels (emoji badges) while keeping all Phase 2 styling intact.

- [ ] **Step 1: Read the current file**

Read `apps/web/src/components/chat/AgentMessage.tsx`. Confirm it:
- Imports `getAgentColor` from `@squad/types`
- Renders `colors.bg`, `colors.border`, `colors.text` from that helper
- Shows mode as a plain text badge already via `MODE_BADGE`
- Shows timestamp via `formatTime`

- [ ] **Step 2: Add emoji prefixes to MODE_BADGE labels**

The existing `MODE_BADGE` object controls badge styling but uses the raw mode word as label (the badge text comes from `message.mode` directly in the JSX). Update the component to prefix emoji to each mode badge by adding a `MODE_LABEL` map:

Replace `apps/web/src/components/chat/AgentMessage.tsx` with:

```tsx
import { getAgentColor } from '@squad/types'
import type { Message } from '@/types/database'

interface AgentMessageProps {
  message: Message
}

const MODE_BADGE: Record<string, string> = {
  brainstorm: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  review: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  plan: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  build: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  status: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

const MODE_LABEL: Record<string, string> = {
  brainstorm: '💡 brainstorm',
  review: '🔍 review',
  plan: '📋 plan',
  build: '🔨 build',
  status: '📊 status',
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function AgentMessage({ message }: AgentMessageProps) {
  const agentId = message.agent_id ?? 'claude-u1'
  const colors = getAgentColor(agentId)
  const modeBadgeClass = message.mode ? MODE_BADGE[message.mode] : ''
  const modeLabel = message.mode ? MODE_LABEL[message.mode] : null

  return (
    <div className={`mx-4 my-1 rounded-lg border-l-4 p-3 ${colors.bg} ${colors.border}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold ${colors.text}`}>{agentId}</span>
        {modeLabel && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${modeBadgeClass}`}>
            {modeLabel}
          </span>
        )}
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
          {formatTime(message.created_at)}
        </span>
      </div>
      <p className="text-sm font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200">
        {message.content || <span className="opacity-40 italic">typing…</span>}
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/AgentMessage.tsx
git commit -m "feat: add emoji mode labels to AgentMessage, keep Phase 2 styling"
```

---

### Task 9: ProposalCard component + /api/approve route

**Files:**
- Create: `apps/web/src/components/chat/ProposalCard.tsx`
- Create: `apps/web/src/app/api/approve/route.ts`

- [ ] **Step 1: Create ProposalCard component**

Create `apps/web/src/components/chat/ProposalCard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { ProposalCard as ProposalCardData, ProposalTask } from '@/lib/anthropic/plan'

interface ProposalCardProps {
  messageId: string
  sessionId: string
  proposal: ProposalCardData
  isHost: boolean
}

function TaskRow({ task }: { task: ProposalTask }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{task.description}</p>
        </div>
        <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-medium">
          {task.assignedAgentId}
        </span>
      </div>
      {task.fileOwnership.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {task.fileOwnership.map((f) => (
            <code key={f} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">
              {f}
            </code>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400">~{task.estimatedTokens.toLocaleString()} tokens</p>
    </div>
  )
}

export function ProposalCard({ messageId, sessionId, proposal, isHost }: ProposalCardProps) {
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApprove() {
    setApproving(true)
    setError(null)
    try {
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, proposalMessageId: messageId }),
      })
      if (res.ok) {
        setApproved(true)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Approval failed')
      }
    } catch {
      setError('Network error')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">📋 Build Proposal</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {proposal.tasks.length} tasks · ~{proposal.totalEstimatedTokens.toLocaleString()} total tokens
        </p>
      </div>

      <div className="p-4 space-y-2">
        {proposal.tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>

      {Object.keys(proposal.tokenSplitPreview).length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Estimated cost split:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(proposal.tokenSplitPreview).map(([userId, tokens]) => (
              <span key={userId} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                {userId.slice(0, 8)}… — {tokens.toLocaleString()} tokens
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pb-4 flex gap-2">
        {isHost ? (
          <>
            <button
              onClick={handleApprove}
              disabled={approving || approved}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {approved ? 'Build started ✓' : approving ? 'Starting…' : 'Approve & Build'}
            </button>
            <button
              disabled={approved}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Modify
            </button>
          </>
        ) : (
          <p className="text-xs text-slate-400">Only the session host can approve the plan.</p>
        )}
        {error && <p className="text-xs text-red-500 self-center">{error}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create /api/approve route (stub — full implementation in Phase 4)**

Create `apps/web/src/app/api/approve/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface ApproveBody {
  sessionId: string
  proposalMessageId: string
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

  // Validate host
  const { data: session } = await supabase
    .from('sessions')
    .select('host_user_id')
    .eq('id', sessionId)
    .single()

  if (!session || session.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Only the session host can approve' }, { status: 403 })
  }

  // Post system message confirming approval (build dispatch in Phase 4)
  await supabase.from('messages').insert({
    session_id: sessionId,
    sender_type: 'system',
    content: `Build approved by host. Agent dispatch coming in Phase 4.`,
    metadata: { proposalMessageId },
  })

  // Update session status to building
  await supabase.from('sessions').update({ status: 'building' }).eq('id', sessionId)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ProposalCard.tsx apps/web/src/app/api/approve/route.ts
git commit -m "feat: add ProposalCard component and /api/approve stub route"
```

---

### Task 10: MessageList — render AgentMessage and ProposalCard

**Files:**
- Modify: `apps/web/src/components/chat/MessageList.tsx`

- [ ] **Step 1: Read current MessageList**

Read `apps/web/src/components/chat/MessageList.tsx` and note its current structure.

- [ ] **Step 2: Update MessageList to render agent messages and proposals**

The MessageList needs to:
- Import and render `AgentMessage` for `sender_type === 'agent'`
- Import and render `ProposalCard` for `mode === 'plan'`
- Accept `isHost` and `members` props

Replace the full file with:

```tsx
'use client'

import { useRealtimeMessages } from '@/hooks/useRealtimeMessages'
import { useEffect, useRef } from 'react'
import type { Message, SessionMember } from '@/types/database'
import { AgentMessage } from './AgentMessage'
import { ProposalCard } from './ProposalCard'
import type { ProposalCard as ProposalCardData } from '@/lib/anthropic/plan'

interface MessageListProps {
  sessionId: string
  currentUserId: string
  initialMessages: Message[]
  currentMember: SessionMember
  members: SessionMember[]
  sessionId_for_approve: string
  isHost: boolean
}

export function MessageList({
  sessionId,
  currentUserId,
  initialMessages,
  isHost,
}: MessageListProps) {
  const messages = useRealtimeMessages(sessionId, initialMessages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
      {messages.map((msg) => {
        if (msg.sender_type === 'system') {
          return (
            <div key={msg.id} className="text-center py-2">
              <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                {msg.content}
              </span>
            </div>
          )
        }

        if (msg.sender_type === 'agent') {
          if (msg.mode === 'plan' && msg.metadata && typeof msg.metadata === 'object' && 'type' in msg.metadata) {
            return (
              <div key={msg.id} className="py-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{msg.agent_id}</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">{msg.content}</p>
                <ProposalCard
                  messageId={msg.id}
                  sessionId={sessionId}
                  proposal={msg.metadata as unknown as ProposalCardData}
                  isHost={isHost}
                />
              </div>
            )
          }
          return <AgentMessage key={msg.id} message={msg} />
        }

        // Human message
        const isOwn = msg.user_id === currentUserId
        return (
          <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} py-1`}>
            <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
              isOwn
                ? 'bg-purple-600 text-white rounded-br-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

1. Send a human message (no @mention) — shows as a bubble on the right
2. Send `@claude-u1 brainstorm database options for a multi-tenant SaaS` — agent response appears with agent badge
3. Send `@claude-u1 plan out a basic todo app with auth` — ProposalCard renders with task list

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/MessageList.tsx
git commit -m "feat: render AgentMessage and ProposalCard in MessageList"
```

---

### Task 11: packages/squad-skill CLI

**Files:**
- Create: `packages/squad-skill/package.json`
- Create: `packages/squad-skill/tsconfig.json`
- Create: `packages/squad-skill/src/index.ts`
- Create: `packages/squad-skill/src/connect.ts`

This package is a standalone CLI. When a user runs `npx @squad/skill connect --agent claude-u2 --session SESSION_ID --api-key sk-ant-xxx`, it:
1. Opens a WebSocket to the Partykit SSS for the given session
2. Registers as the given agent (marks it "locally connected")
3. Listens for `route_to_agent` messages
4. When one arrives, calls the Anthropic API (with the user's key), gets a response
5. Posts the response back to SSS which inserts it as a message row

- [ ] **Step 1: Create package.json**

Create `packages/squad-skill/package.json`:

```json
{
  "name": "@squad/skill",
  "version": "0.1.0",
  "description": "Connect your local Claude agent to a Squad session",
  "type": "module",
  "bin": {
    "squad-skill": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "partysocket": "^1.0.2",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.14",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/squad-skill/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create connect.ts — WebSocket loop**

Create `packages/squad-skill/src/connect.ts`:

```typescript
import WebSocket from 'ws'
import Anthropic from '@anthropic-ai/sdk'

interface ConnectOptions {
  sessionId: string
  agentId: string
  apiKey: string
  partyUrl: string
}

interface RouteMessage {
  type: 'route_to_agent'
  agentId: string
  content: string
  mode: string
  requestId: string
}

interface RegisterMessage {
  type: 'agent_register'
  agentId: string
  source: 'local'
}

export async function connectToSession(opts: ConnectOptions): Promise<void> {
  const { sessionId, agentId, apiKey, partyUrl } = opts
  const anthropic = new Anthropic({ apiKey })

  const wsUrl = `${partyUrl}/parties/main/${sessionId}`
  console.log(`Connecting to ${wsUrl} as ${agentId}…`)

  const ws = new WebSocket(wsUrl)

  ws.on('open', () => {
    const register: RegisterMessage = { type: 'agent_register', agentId, source: 'local' }
    ws.send(JSON.stringify(register))
    console.log(`Connected. Listening for messages as ${agentId}`)
  })

  ws.on('message', async (raw) => {
    let msg: RouteMessage
    try {
      msg = JSON.parse(raw.toString()) as RouteMessage
    } catch {
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

      console.log(`[${agentId}] responded (${response.usage.output_tokens} tokens out)`)
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

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log('\nDisconnecting…')
      ws.close()
      resolve()
    })
  })
}
```

- [ ] **Step 4: Create index.ts — CLI entry point**

Create `packages/squad-skill/src/index.ts`:

```typescript
#!/usr/bin/env node

import { connectToSession } from './connect.js'

function parseArgs(): { sessionId: string; agentId: string; apiKey: string; partyUrl: string } {
  const args = process.argv.slice(2)

  function getFlag(name: string): string | undefined {
    const idx = args.findIndex((a) => a === `--${name}`)
    return idx !== -1 ? args[idx + 1] : undefined
  }

  const command = args[0]
  if (command !== 'connect') {
    console.error('Usage: squad-skill connect --session <id> --agent <agentId> [--api-key <key>] [--party-url <url>]')
    process.exit(1)
  }

  const sessionId = getFlag('session')
  const agentId = getFlag('agent')
  const apiKey = getFlag('api-key') ?? process.env.ANTHROPIC_API_KEY
  const partyUrl = getFlag('party-url') ?? process.env.PARTYKIT_HOST ?? 'ws://localhost:1999'

  if (!sessionId || !agentId || !apiKey) {
    console.error('Missing required: --session, --agent, and --api-key (or ANTHROPIC_API_KEY env)')
    process.exit(1)
  }

  return { sessionId, agentId, apiKey, partyUrl }
}

void connectToSession(parseArgs())
```

- [ ] **Step 5: Install deps and build**

```bash
cd packages/squad-skill && pnpm install && pnpm build
```

Expected: `dist/index.js` and `dist/connect.js` created with no TypeScript errors.

- [ ] **Step 6: Smoke test the CLI**

```bash
node packages/squad-skill/dist/index.js connect --help
```

Expected output contains usage instructions (will exit with error message since args missing — that's fine).

- [ ] **Step 7: Commit**

```bash
git add packages/squad-skill/
git commit -m "feat: add squad-skill CLI for local agent connection to Partykit SSS"
```

---

### Task 12: Acceptance testing (Phase 3 criteria)

- [ ] **Brainstorm test**

With `pnpm dev` running, open the session. Enter your API key via ConnectionModal. Send:
`@claude-u1 what do you think about using Postgres vs MongoDB?`

Expected: Streaming response appears from claude-u1 with brainstorm mode label. Response appears within 5s.

- [ ] **Review test**

Send:
```
@claude-u1 review this code:
```js
function add(a, b) { return a + b }
```
```

Expected: claude-u1 responds with review feedback. Mode label shows "🔍 Review".

- [ ] **Plan test**

Send:
`@claude-u1 plan out a simple todo app with auth`

Expected: ProposalCard appears in chat with task list, agent assignments, token estimates. For host user, Approve & Build button is enabled. For non-host, the "only host can approve" message shows.

- [ ] **Low confidence fallback test**

Send:
`@claude-u1 hmm`

Expected: Response appears as brainstorm (not plan, not build). Verify by checking response style.

- [ ] **@all test**

Add a second member to the session. Send:
`@all quick status check`

Expected: Both agents respond in sequence (not simultaneously). Each response has the correct agent badge.

- [ ] **API key not entered test**

Clear the session API key (refresh page without re-entering). Send `@claude-u1 hello`.

Expected: Human message inserts, but no agent response appears. No crash. (Future: show "agent not connected" system message.)

- [ ] **Commit final**

```bash
git add -A
git commit -m "chore: phase 3 acceptance testing complete"
```

---

## Phase 3 Acceptance Criteria Checklist

- [ ] `@claude-1 what do you think about using Postgres vs MongoDB?` → streaming text response in chat
- [ ] `@claude-1 review this code: [code block]` → structured review response in chat
- [ ] `@claude-1 plan this out` → ProposalCard renders in chat with task list and token estimates
- [ ] Haiku classification returns in < 400ms
- [ ] Confidence < 0.70 always falls back to brainstorm
- [ ] Agent response appears with correct agent name and color
- [ ] @all sends to each agent in sequence, each capped appropriately
- [ ] Approve button visible to host only
- [ ] Clicking Approve posts system message confirming approval
- [ ] squad-skill CLI builds and connects to Partykit SSS

---

## Notes for Phase 4

Phase 4 (single-agent build execution) will:
1. Implement `packages/agent-runner/src/runner.ts` with full Claude Code SDK hooks
2. Wire `/api/approve` to actually dispatch build tasks to agent-runner
3. Implement GitHub OAuth + branch creation via Octokit
4. Add squad-skill routing in the Partykit SSS (broadcast `route_to_agent` to locally-connected agents)
5. Stream build status updates from agent-runner into group chat via SSS
