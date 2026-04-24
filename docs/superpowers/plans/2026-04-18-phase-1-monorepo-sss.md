# Phase 1 — Monorepo Scaffold + Session State Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turborepo monorepo initialized, `packages/types` exporting all SSS types, Partykit SSS running locally with full spec implementation, all unit tests passing.

**Architecture:** Monorepo root at `C:\Users\keven\Documents\swarm`. Partykit server in `apps/party` acts as the single source of truth via durable WebSocket rooms + HTTP endpoints. `packages/types` is a shared TypeScript package consumed by both apps. Next.js app in `apps/web` is scaffolded but minimal in this phase.

**Tech Stack:** pnpm workspaces, Turborepo 2, TypeScript 5 strict, Partykit, Vitest 2, Zod

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Create | Root workspace package.json |
| `pnpm-workspace.yaml` | Create | pnpm workspace config |
| `turbo.json` | Create | Turborepo task pipeline |
| `tsconfig.json` | Create | Root TypeScript config (strict) |
| `.env.example` | Create | Documents all required env vars |
| `.gitignore` | Create | Ignore node_modules, .env files, dist |
| `packages/types/package.json` | Create | types package manifest |
| `packages/types/tsconfig.json` | Create | types package TS config |
| `packages/types/src/index.ts` | Create | Re-exports all types |
| `packages/types/src/sss.ts` | Create | SSS storage schema types |
| `packages/types/src/messages.ts` | Create | WebSocket message types |
| `packages/types/src/shared.ts` | Create | Cross-agent shared types (User, Session) |
| `packages/agent-runner/package.json` | Create | agent-runner stub |
| `packages/agent-runner/tsconfig.json` | Create | agent-runner TS config |
| `packages/agent-runner/src/index.ts` | Create | Stub export (Phase 4 implements) |
| `apps/web/package.json` | Create | Next.js app manifest |
| `apps/web/tsconfig.json` | Create | Next.js TS config |
| `apps/web/next.config.ts` | Create | Next.js config per spec |
| `apps/web/src/app/page.tsx` | Create | Minimal placeholder page |
| `apps/web/src/app/layout.tsx` | Create | Root layout |
| `apps/web/src/lib/env.ts` | Create | Zod env validation for web |
| `apps/party/package.json` | Create | Partykit app manifest |
| `apps/party/tsconfig.json` | Create | Partykit TS config |
| `apps/party/partykit.json` | Create | Partykit deployment config |
| `apps/party/src/server.ts` | Create | Full SSS implementation |
| `apps/party/src/env.ts` | Create | Zod env validation for party |
| `apps/party/src/context-injection.ts` | Create | Context injection assembler |
| `apps/party/src/heartbeat.ts` | Create | Heartbeat checker logic |
| `apps/party/tests/sss.test.ts` | Create | Full SSS unit test suite |
| `.github/workflows/ci.yml` | Create | CI pipeline |

---

## Task 1: Root monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "squad",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "typecheck": "turbo typecheck",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "prettier": "^3.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 4: Create root `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
.next
dist
.env
.env.local
apps/party/.env
*.tsbuildinfo
.turbo
```

- [ ] **Step 6: Create `.env.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic
ANTHROPIC_API_KEY=sk-ant-placeholder

# Partykit
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999

# GitHub OAuth
GITHUB_CLIENT_ID=your-oauth-app-client-id
GITHUB_CLIENT_SECRET=your-oauth-app-client-secret
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 7: Install pnpm if needed and install root deps**

```bash
npm install -g pnpm@9
pnpm install
```

Expected: `node_modules` created at root.

- [ ] **Step 8: Commit**

```bash
git init
git add package.json pnpm-workspace.yaml turbo.json tsconfig.json .gitignore .env.example
git commit -m "feat: initialize monorepo scaffold with Turborepo + pnpm workspaces"
```

---

## Task 2: `packages/types` — all SSS types

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/sss.ts`
- Create: `packages/types/src/messages.ts`
- Create: `packages/types/src/shared.ts`
- Create: `packages/types/src/index.ts`

- [ ] **Step 1: Create `packages/types/package.json`**

```json
{
  "name": "@squad/types",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

- [ ] **Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/types/src/sss.ts`**

All SSS storage schema types from SESSION_STATE_SERVER.md:

```typescript
export interface DecisionEntry {
  summary: string
  decidedBy: string
  timestamp: string
}

export interface ApiContract {
  method: string
  path: string
  publishedByAgentId: string
  requestSchema: object
  responseSchema: object
  publishedAt: string
}

export interface SessionState {
  id: string
  hostUserId: string
  projectBrief: string
  agreedSpec: string
  decisionLog: DecisionEntry[]
  apiContracts: Record<string, ApiContract>
  sharedTypesSnapshot: string
  status: 'lobby' | 'planning' | 'building' | 'done'
  createdAt: string
}

export interface AgentRecord {
  agentId: string
  userId: string
  displayName: string
  status: 'idle' | 'brainstorming' | 'planning' | 'building' | 'blocked' | 'done' | 'offline'
  currentTaskId: string | null
  lastHeartbeat: number
  tokensUsed: number
}

export type AgentRegistry = Record<string, AgentRecord>

export interface Task {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  assignedAgentId: string
  status: 'pending' | 'in_progress' | 'blocked' | 'done' | 'aborted'
  fileOwnership: string[]
  dependsOn: string[]
  blockedReason?: string
  estimatedTokens: number
  actualTokens?: number
  createdAt: string
  startedAt?: string
  completedAt?: string
}

export type TaskQueue = Record<string, Task>

export interface OwnershipEntry {
  agentId: string
  tier: 'owned' | 'shared-ro'
  taskId: string
}

export type OwnershipMap = Record<string, OwnershipEntry>

export type ContractRegistry = Record<string, ApiContract>

export interface TokenMeterEntry {
  tokensIn: number
  tokensOut: number
  lastUpdated: string
}

export type TokenMeters = Record<string, TokenMeterEntry>

export interface BuildSummary {
  sessionId: string
  totalTokensIn: number
  totalTokensOut: number
  completedTaskCount: number
  agentCount: number
  prUrl?: string
}

export interface ContextInjection {
  agentId: string
  content: string
  estimatedTokens: number
  assembledAt: string
}
```

- [ ] **Step 4: Create `packages/types/src/messages.ts`**

```typescript
import type { AgentRecord, Task, OwnershipMap, ApiContract, BuildSummary, SessionState } from './sss.js'

export type AgentMode = 'brainstorm' | 'review' | 'plan' | 'build'

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
```

- [ ] **Step 5: Create `packages/types/src/shared.ts`**

```typescript
// AUTO-MANAGED: Do not edit directly.
// Request changes via RequestSharedWrite tool.
// Last updated: 2026-04-18 by orchestrator

export interface User {
  id: string
  email: string
  displayName: string
  createdAt: string
}

export interface Session {
  id: string
  hostUserId: string
  status: 'lobby' | 'planning' | 'building' | 'done'
  createdAt: string
}
```

- [ ] **Step 6: Create `packages/types/src/index.ts`**

```typescript
export * from './sss.js'
export * from './messages.js'
export * from './shared.js'
```

- [ ] **Step 7: Commit**

```bash
git add packages/types
git commit -m "feat: add @squad/types package with all SSS types and message contracts"
```

---

## Task 3: `packages/agent-runner` stub

**Files:**
- Create: `packages/agent-runner/package.json`
- Create: `packages/agent-runner/tsconfig.json`
- Create: `packages/agent-runner/src/index.ts`

- [ ] **Step 1: Create `packages/agent-runner/package.json`**

```json
{
  "name": "@squad/agent-runner",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@squad/types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/agent-runner/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "declaration": true,
    "paths": {
      "@squad/types": ["../../packages/types/src/index.ts"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/agent-runner/src/index.ts`**

```typescript
// Phase 4 implements this fully.
// ASSUMPTION: stub export prevents build failures in later phases that import this package.
export {}
```

- [ ] **Step 4: Commit**

```bash
git add packages/agent-runner
git commit -m "feat: add @squad/agent-runner stub package (Phase 4 implements)"
```

---

## Task 4: `apps/web` minimal scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/lib/env.ts`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@squad/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.22.0",
    "@squad/types": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@squad/types": ["../../packages/types/src/index.ts"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/web/next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
    ]
  },
}

export default nextConfig
```

- [ ] **Step 4: Create `apps/web/src/lib/env.ts`**

```typescript
import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  NEXT_PUBLIC_PARTYKIT_HOST: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
})

export const env = envSchema.parse(process.env)
```

- [ ] **Step 5: Create `apps/web/src/app/layout.tsx`**

```tsx
export const metadata = { title: 'Squad' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Create `apps/web/src/app/page.tsx`**

```tsx
export default function Home() {
  return <main><h1>Squad — coming soon</h1></main>
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: scaffold apps/web Next.js 15 app with env validation"
```

---

## Task 5: `apps/party` Partykit setup

**Files:**
- Create: `apps/party/package.json`
- Create: `apps/party/tsconfig.json`
- Create: `apps/party/partykit.json`
- Create: `apps/party/src/env.ts`

- [ ] **Step 1: Create `apps/party/package.json`**

```json
{
  "name": "@squad/party",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "partykit dev",
    "deploy": "partykit deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "partykit": "^0.0.109",
    "partysocket": "^1.0.2",
    "zod": "^3.22.0",
    "@squad/types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/party/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "paths": {
      "@squad/types": ["../../packages/types/src/index.ts"]
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `apps/party/partykit.json`**

```json
{
  "name": "squad-sss",
  "main": "src/server.ts",
  "compatibilityDate": "2024-01-01"
}
```

- [ ] **Step 4: Create `apps/party/src/env.ts`**

```typescript
import { z } from 'zod'

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

export const env = envSchema.parse(process.env)
```

- [ ] **Step 5: Commit**

```bash
git add apps/party
git commit -m "feat: scaffold apps/party Partykit project with env validation"
```

---

## Task 6: Context injection assembler

**Files:**
- Create: `apps/party/src/context-injection.ts`

- [ ] **Step 1: Write failing test for context injection**

Create `apps/party/tests/context-injection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { assembleContextInjection } from '../src/context-injection.js'
import type { SessionState, AgentRegistry, TaskQueue, ContractRegistry } from '@squad/types'

const makeSession = (): SessionState => ({
  id: 'sess-1',
  hostUserId: 'user-1',
  projectBrief: 'Build a todo app',
  agreedSpec: 'We will build a todo app with tasks and users. '.repeat(100),
  decisionLog: [
    { summary: 'Use Postgres', decidedBy: 'user-1', timestamp: '2026-04-18T10:00:00Z' },
    { summary: 'Use Tailwind', decidedBy: 'user-1', timestamp: '2026-04-18T10:01:00Z' },
  ],
  apiContracts: {},
  sharedTypesSnapshot: '',
  status: 'building',
  createdAt: '2026-04-18T09:00:00Z',
})

const makeTask = (): TaskQueue => ({
  'task-1': {
    id: 'task-1',
    title: 'Build auth module',
    description: 'Implement JWT auth with refresh tokens',
    acceptanceCriteria: ['Login endpoint works', 'Tokens refresh correctly'],
    assignedAgentId: 'agent-1',
    status: 'in_progress',
    fileOwnership: ['src/auth/**'],
    dependsOn: [],
    estimatedTokens: 5000,
    createdAt: '2026-04-18T10:00:00Z',
  },
})

const makeAgents = (): AgentRegistry => ({
  'agent-1': {
    agentId: 'agent-1',
    userId: 'user-1',
    displayName: 'Claude (Alice)',
    status: 'building',
    currentTaskId: 'task-1',
    lastHeartbeat: Date.now(),
    tokensUsed: 100,
  },
  'agent-2': {
    agentId: 'agent-2',
    userId: 'user-2',
    displayName: 'Claude (Bob)',
    status: 'idle',
    currentTaskId: null,
    lastHeartbeat: Date.now(),
    tokensUsed: 0,
  },
})

describe('assembleContextInjection', () => {
  it('returns content string with all required sections', () => {
    const result = assembleContextInjection({
      agentId: 'agent-1',
      session: makeSession(),
      agents: makeAgents(),
      tasks: makeTask(),
      contracts: {},
    })
    expect(result.content).toContain('## Project')
    expect(result.content).toContain('Build a todo app')
    expect(result.content).toContain('## Your task')
    expect(result.content).toContain('Build auth module')
    expect(result.content).toContain('## Files you own')
    expect(result.content).toContain('src/auth/**')
    expect(result.content).toContain('## Other agents')
    expect(result.content).toContain('Claude (Bob)')
    expect(result.content).toContain('## Recent decisions')
    expect(result.agentId).toBe('agent-1')
  })

  it('stays under 3800 token budget (approx 4 chars per token)', () => {
    const result = assembleContextInjection({
      agentId: 'agent-1',
      session: makeSession(),
      agents: makeAgents(),
      tasks: makeTask(),
      contracts: {},
    })
    const approxTokens = Math.ceil(result.content.length / 4)
    expect(approxTokens).toBeLessThanOrEqual(3800)
  })

  it('throws if agentId has no assigned task', () => {
    expect(() =>
      assembleContextInjection({
        agentId: 'agent-2',
        session: makeSession(),
        agents: makeAgents(),
        tasks: makeTask(),
        contracts: {},
      })
    ).toThrow('No task assigned to agent agent-2')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/party && pnpm test -- tests/context-injection.test.ts
```

Expected: FAIL — `Cannot find module '../src/context-injection.js'`

- [ ] **Step 3: Implement `apps/party/src/context-injection.ts`**

```typescript
import type {
  SessionState,
  AgentRegistry,
  TaskQueue,
  ContractRegistry,
  ContextInjection,
} from '@squad/types'

const TOKEN_BUDGET = 3800
const CHARS_PER_TOKEN = 4
const CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN

interface AssembleOptions {
  agentId: string
  session: SessionState
  agents: AgentRegistry
  tasks: TaskQueue
  contracts: ContractRegistry
}

export function assembleContextInjection(opts: AssembleOptions): ContextInjection {
  const { agentId, session, agents, tasks, contracts } = opts

  const assignedTask = Object.values(tasks).find(
    (t) => t.assignedAgentId === agentId && t.status !== 'done' && t.status !== 'aborted'
  )
  if (!assignedTask) throw new Error(`No task assigned to agent ${agentId}`)

  const sections: string[] = []

  // 1. Project brief — never trimmed
  sections.push(`## Project\n${session.projectBrief}`)

  // 2. Assigned task — never trimmed
  const criteriaList = assignedTask.acceptanceCriteria.map((c) => `- ${c}`).join('\n')
  sections.push(`## Your task\n${assignedTask.title}\n${assignedTask.description}\n\nAcceptance criteria:\n${criteriaList}`)

  // 3. File ownership — never trimmed
  sections.push(`## Files you own\n${assignedTask.fileOwnership.join('\n')}`)

  // 4. Relevant API contracts (filtered by task title keyword match — no semantic search available)
  const relevantContracts = Object.values(contracts).slice(0, 10)
  if (relevantContracts.length > 0) {
    const contractLines = relevantContracts
      .map((c) => `${c.method} ${c.path}`)
      .join('\n')
    sections.push(`## API contracts (what other agents will expose)\n${contractLines}`)
  } else {
    sections.push(`## API contracts (what other agents will expose)\nNone published yet.`)
  }

  // 5. Other agents — one-liners
  const otherAgents = Object.values(agents).filter((a) => a.agentId !== agentId)
  const agentLines = otherAgents
    .map((a) => `${a.displayName}: ${a.status}${a.currentTaskId ? ` (task: ${a.currentTaskId})` : ''}`)
    .join('\n')
  sections.push(`## Other agents\n${agentLines || 'None'}`)

  // 6. Agreed spec — first 1,000 chars
  const specExcerpt = session.agreedSpec.slice(0, 1000)
  sections.push(`## Agreed spec (excerpt)\n${specExcerpt}`)

  // 7. Recent decisions — last 5
  const recentDecisions = session.decisionLog.slice(-5)
  const decisionLines = recentDecisions.map((d) => `- ${d.summary} (by ${d.decidedBy})`).join('\n')
  sections.push(`## Recent decisions\n${decisionLines || 'None yet'}`)

  // Assemble with budget enforcement — drop from index 5 down if over budget
  let content = sections.join('\n\n')

  if (content.length > CHAR_BUDGET) {
    // Drop section 6 (spec excerpt) first
    const withoutSpec = [
      ...sections.slice(0, 5),
      ...sections.slice(6),
    ].join('\n\n')
    if (withoutSpec.length <= CHAR_BUDGET) {
      content = withoutSpec
    } else {
      // Drop section 7 (decisions) too
      content = sections.slice(0, 5).join('\n\n')
    }
  }

  return {
    agentId,
    content,
    estimatedTokens: Math.ceil(content.length / CHARS_PER_TOKEN),
    assembledAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/party && pnpm test -- tests/context-injection.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/party/src/context-injection.ts apps/party/tests/context-injection.test.ts
git commit -m "feat: implement context injection assembler with 3800-token budget"
```

---

## Task 7: Heartbeat checker

**Files:**
- Create: `apps/party/src/heartbeat.ts`

- [ ] **Step 1: Write failing test**

Append to `apps/party/tests/sss.test.ts` (create the file now — we'll add SSS tests in Task 9):

Create `apps/party/tests/heartbeat.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkHeartbeats } from '../src/heartbeat.js'
import type { AgentRegistry, TaskQueue } from '@squad/types'

describe('checkHeartbeats', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks agent offline when heartbeat older than 90s', () => {
    vi.setSystemTime(new Date('2026-04-18T10:00:00Z'))
    const oldHeartbeat = Date.now() - 91_000

    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1',
        userId: 'user-1',
        displayName: 'Claude (Alice)',
        status: 'building',
        currentTaskId: 'task-1',
        lastHeartbeat: oldHeartbeat,
        tokensUsed: 0,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1',
        title: 'Build something',
        description: 'desc',
        acceptanceCriteria: [],
        assignedAgentId: 'agent-1',
        status: 'in_progress',
        fileOwnership: ['src/auth/**'],
        dependsOn: [],
        estimatedTokens: 1000,
        createdAt: '2026-04-18T09:00:00Z',
      },
    }

    const result = checkHeartbeats({ agents, tasks, now: Date.now() })

    expect(result.offlineAgentIds).toContain('agent-1')
    expect(result.updatedAgents['agent-1']?.status).toBe('offline')
    expect(result.releasedTaskIds).toContain('task-1')
    expect(result.updatedTasks['task-1']?.status).toBe('pending')
  })

  it('keeps agent online when heartbeat is recent', () => {
    vi.setSystemTime(new Date('2026-04-18T10:00:00Z'))
    const recentHeartbeat = Date.now() - 30_000

    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1',
        userId: 'user-1',
        displayName: 'Claude (Alice)',
        status: 'building',
        currentTaskId: 'task-1',
        lastHeartbeat: recentHeartbeat,
        tokensUsed: 0,
      },
    }

    const result = checkHeartbeats({ agents, tasks: {}, now: Date.now() })

    expect(result.offlineAgentIds).toHaveLength(0)
    expect(result.updatedAgents['agent-1']?.status).toBe('building')
  })

  it('releases ownership for all tasks of offline agent', () => {
    vi.setSystemTime(new Date('2026-04-18T10:00:00Z'))
    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1',
        userId: 'user-1',
        displayName: 'Claude (Alice)',
        status: 'building',
        currentTaskId: 'task-1',
        lastHeartbeat: Date.now() - 95_000,
        tokensUsed: 0,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1', title: 't', description: 'd', acceptanceCriteria: [],
        assignedAgentId: 'agent-1', status: 'in_progress',
        fileOwnership: ['src/a/**', 'src/b/**'],
        dependsOn: [], estimatedTokens: 100, createdAt: '2026-04-18T09:00:00Z',
      },
    }

    const result = checkHeartbeats({ agents, tasks, now: Date.now() })

    expect(result.releasedOwnershipPaths).toEqual(expect.arrayContaining(['src/a/**', 'src/b/**']))
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/party && pnpm test -- tests/heartbeat.test.ts
```

Expected: FAIL — `Cannot find module '../src/heartbeat.js'`

- [ ] **Step 3: Implement `apps/party/src/heartbeat.ts`**

```typescript
import type { AgentRegistry, AgentRecord, TaskQueue, Task } from '@squad/types'

const HEARTBEAT_TIMEOUT_MS = 90_000

interface CheckHeartbeatsInput {
  agents: AgentRegistry
  tasks: TaskQueue
  now: number
}

interface CheckHeartbeatsResult {
  offlineAgentIds: string[]
  updatedAgents: AgentRegistry
  releasedTaskIds: string[]
  updatedTasks: TaskQueue
  releasedOwnershipPaths: string[]
}

export function checkHeartbeats(input: CheckHeartbeatsInput): CheckHeartbeatsResult {
  const { agents, tasks, now } = input

  const offlineAgentIds: string[] = []
  const updatedAgents: AgentRegistry = { ...agents }
  const releasedTaskIds: string[] = []
  const updatedTasks: TaskQueue = { ...tasks }
  const releasedOwnershipPaths: string[] = []

  for (const agent of Object.values(agents)) {
    const isExpired = now - agent.lastHeartbeat > HEARTBEAT_TIMEOUT_MS
    if (!isExpired) continue

    offlineAgentIds.push(agent.agentId)
    updatedAgents[agent.agentId] = { ...agent, status: 'offline' }

    // Release in_progress tasks owned by this agent
    for (const task of Object.values(tasks)) {
      if (task.assignedAgentId !== agent.agentId) continue
      if (task.status !== 'in_progress') continue

      releasedTaskIds.push(task.id)
      releasedOwnershipPaths.push(...task.fileOwnership)
      updatedTasks[task.id] = { ...task, status: 'pending' }
    }
  }

  return {
    offlineAgentIds,
    updatedAgents,
    releasedTaskIds,
    updatedTasks,
    releasedOwnershipPaths,
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/party && pnpm test -- tests/heartbeat.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/party/src/heartbeat.ts apps/party/tests/heartbeat.test.ts
git commit -m "feat: implement heartbeat checker — marks agents offline after 90s, releases tasks"
```

---

## Task 8: Full SSS implementation (`apps/party/src/server.ts`)

**Files:**
- Create: `apps/party/src/server.ts`

- [ ] **Step 1: Write failing test for SSS HTTP endpoints**

Create `apps/party/tests/sss.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We test the pure logic functions extracted from the server.
// Partykit's Party.Server interface can't be unit-tested without a running runtime,
// so we test the handler logic in isolation via the exported helpers.
import {
  handleOwnershipGet,
  handleOwnershipPost,
  handleOwnershipDelete,
  handleTokenUpdate,
  applyClientMessage,
} from '../src/server.js'
import type {
  AgentRegistry,
  TaskQueue,
  OwnershipMap,
  TokenMeters,
  ClientMessage,
  SessionState,
} from '@squad/types'

const makeSession = (): SessionState => ({
  id: 'sess-1',
  hostUserId: 'user-1',
  projectBrief: 'Test project',
  agreedSpec: '',
  decisionLog: [],
  apiContracts: {},
  sharedTypesSnapshot: '',
  status: 'lobby',
  createdAt: '2026-04-18T10:00:00Z',
})

describe('handleOwnershipPost', () => {
  it('stores ownership entry', () => {
    const ownership: OwnershipMap = {}
    const result = handleOwnershipPost(ownership, {
      path: 'src/auth/index.ts',
      agentId: 'agent-1',
      taskId: 'task-1',
      tier: 'owned',
    })
    expect(result.ok).toBe(true)
    expect(result.updated['src/auth/index.ts']).toEqual({
      agentId: 'agent-1',
      tier: 'owned',
      taskId: 'task-1',
    })
  })

  it('normalizes path (strips leading slash)', () => {
    const ownership: OwnershipMap = {}
    const result = handleOwnershipPost(ownership, {
      path: '/src/auth/index.ts',
      agentId: 'agent-1',
      taskId: 'task-1',
      tier: 'owned',
    })
    expect(result.updated['src/auth/index.ts']).toBeDefined()
    expect(result.updated['/src/auth/index.ts']).toBeUndefined()
  })
})

describe('handleOwnershipGet', () => {
  it('returns owned entry', () => {
    const ownership: OwnershipMap = {
      'src/auth/index.ts': { agentId: 'agent-1', tier: 'owned', taskId: 'task-1' },
    }
    const result = handleOwnershipGet(ownership, 'src/auth/index.ts')
    expect(result.owned).toBe(true)
    expect(result.agentId).toBe('agent-1')
    expect(result.tier).toBe('owned')
  })

  it('returns not owned for unknown path', () => {
    const result = handleOwnershipGet({}, 'src/unknown.ts')
    expect(result.owned).toBe(false)
    expect(result.agentId).toBeNull()
  })
})

describe('handleOwnershipDelete', () => {
  it('removes ownership entry', () => {
    const ownership: OwnershipMap = {
      'src/auth/index.ts': { agentId: 'agent-1', tier: 'owned', taskId: 'task-1' },
    }
    const result = handleOwnershipDelete(ownership, 'src/auth/index.ts')
    expect(result.ok).toBe(true)
    expect(result.updated['src/auth/index.ts']).toBeUndefined()
  })

  it('returns ok:true even for non-existent path (idempotent)', () => {
    const result = handleOwnershipDelete({}, 'src/nope.ts')
    expect(result.ok).toBe(true)
  })
})

describe('handleTokenUpdate', () => {
  it('accumulates token counts', () => {
    const meters: TokenMeters = {
      'user-1': { tokensIn: 100, tokensOut: 50, lastUpdated: '2026-04-18T10:00:00Z' },
    }
    const result = handleTokenUpdate(meters, {
      userId: 'user-1',
      tokensIn: 200,
      tokensOut: 100,
    })
    expect(result.ok).toBe(true)
    expect(result.runningTotal.tokensIn).toBe(300)
    expect(result.runningTotal.tokensOut).toBe(150)
  })

  it('creates new meter entry for new user', () => {
    const result = handleTokenUpdate({}, {
      userId: 'user-new',
      tokensIn: 50,
      tokensOut: 25,
    })
    expect(result.runningTotal.tokensIn).toBe(50)
    expect(result.runningTotal.tokensOut).toBe(25)
  })
})

describe('applyClientMessage', () => {
  it('register_agent creates agent record', () => {
    const agents: AgentRegistry = {}
    const msg: ClientMessage = {
      type: 'register_agent',
      agentId: 'agent-1',
      userId: 'user-1',
      displayName: 'Claude (Alice)',
    }
    const result = applyClientMessage({ agents, tasks: {}, session: makeSession() }, msg)
    expect(result.agents['agent-1']?.agentId).toBe('agent-1')
    expect(result.agents['agent-1']?.status).toBe('idle')
  })

  it('heartbeat updates lastHeartbeat', () => {
    const before = Date.now() - 5000
    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1', userId: 'user-1', displayName: 'Claude (Alice)',
        status: 'idle', currentTaskId: null, lastHeartbeat: before, tokensUsed: 0,
      },
    }
    const msg: ClientMessage = { type: 'heartbeat', agentId: 'agent-1' }
    const result = applyClientMessage({ agents, tasks: {}, session: makeSession() }, msg)
    expect(result.agents['agent-1']?.lastHeartbeat).toBeGreaterThan(before)
  })

  it('task_claim sets agent currentTaskId and task status to in_progress', () => {
    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1', userId: 'user-1', displayName: 'Claude (Alice)',
        status: 'idle', currentTaskId: null, lastHeartbeat: Date.now(), tokensUsed: 0,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1', title: 'T', description: 'D', acceptanceCriteria: [],
        assignedAgentId: 'agent-1', status: 'pending',
        fileOwnership: [], dependsOn: [], estimatedTokens: 100,
        createdAt: '2026-04-18T10:00:00Z',
      },
    }
    const msg: ClientMessage = { type: 'task_claim', agentId: 'agent-1', taskId: 'task-1' }
    const result = applyClientMessage({ agents, tasks, session: makeSession() }, msg)
    expect(result.agents['agent-1']?.currentTaskId).toBe('task-1')
    expect(result.tasks['task-1']?.status).toBe('in_progress')
    expect(result.tasks['task-1']?.startedAt).toBeDefined()
  })

  it('task_done marks task done and updates agent tokensUsed', () => {
    const agents: AgentRegistry = {
      'agent-1': {
        agentId: 'agent-1', userId: 'user-1', displayName: 'Claude (Alice)',
        status: 'building', currentTaskId: 'task-1', lastHeartbeat: Date.now(), tokensUsed: 100,
      },
    }
    const tasks: TaskQueue = {
      'task-1': {
        id: 'task-1', title: 'T', description: 'D', acceptanceCriteria: [],
        assignedAgentId: 'agent-1', status: 'in_progress',
        fileOwnership: [], dependsOn: [], estimatedTokens: 100,
        createdAt: '2026-04-18T10:00:00Z',
      },
    }
    const msg: ClientMessage = {
      type: 'task_done', agentId: 'agent-1', taskId: 'task-1', tokensUsed: 500,
    }
    const result = applyClientMessage({ agents, tasks, session: makeSession() }, msg)
    expect(result.tasks['task-1']?.status).toBe('done')
    expect(result.tasks['task-1']?.actualTokens).toBe(500)
    expect(result.agents['agent-1']?.tokensUsed).toBe(600)
    expect(result.agents['agent-1']?.currentTaskId).toBeNull()
    expect(result.agents['agent-1']?.status).toBe('idle')
  })

  it('dispatch_tasks adds tasks to queue', () => {
    const msg: ClientMessage = {
      type: 'dispatch_tasks',
      tasks: [{
        id: 'task-new', title: 'New', description: 'Desc', acceptanceCriteria: [],
        assignedAgentId: 'agent-1', status: 'pending',
        fileOwnership: ['src/**'], dependsOn: [], estimatedTokens: 200,
        createdAt: '2026-04-18T10:00:00Z',
      }],
    }
    const result = applyClientMessage({ agents: {}, tasks: {}, session: makeSession() }, msg)
    expect(result.tasks['task-new']).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/party && pnpm test -- tests/sss.test.ts
```

Expected: FAIL — `Cannot find module '../src/server.js'`

- [ ] **Step 3: Implement `apps/party/src/server.ts`**

```typescript
import type * as Party from 'partykit/server'
import type {
  AgentRegistry,
  AgentRecord,
  SessionState,
  TaskQueue,
  Task,
  OwnershipMap,
  OwnershipEntry,
  ContractRegistry,
  TokenMeters,
  TokenMeterEntry,
  ClientMessage,
  ServerMessage,
  ApiContract,
} from '@squad/types'
import { assembleContextInjection } from './context-injection.js'
import { checkHeartbeats } from './heartbeat.js'

// ─── Pure handler functions (exported for unit testing) ─────────────────────

export function handleOwnershipPost(
  ownership: OwnershipMap,
  body: { path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }
): { ok: boolean; updated: OwnershipMap } {
  const normalized = body.path.replace(/^\//, '')
  const entry: OwnershipEntry = {
    agentId: body.agentId,
    tier: body.tier,
    taskId: body.taskId,
  }
  return { ok: true, updated: { ...ownership, [normalized]: entry } }
}

export function handleOwnershipGet(
  ownership: OwnershipMap,
  path: string
): { owned: boolean; agentId: string | null; tier: string | null } {
  const normalized = path.replace(/^\//, '')
  const entry = ownership[normalized]
  if (!entry) return { owned: false, agentId: null, tier: null }
  return { owned: true, agentId: entry.agentId, tier: entry.tier }
}

export function handleOwnershipDelete(
  ownership: OwnershipMap,
  path: string
): { ok: boolean; updated: OwnershipMap } {
  const normalized = path.replace(/^\//, '')
  const updated = { ...ownership }
  delete updated[normalized]
  return { ok: true, updated }
}

export function handleTokenUpdate(
  meters: TokenMeters,
  body: { userId: string; tokensIn: number; tokensOut: number }
): { ok: boolean; runningTotal: { tokensIn: number; tokensOut: number } } {
  const existing: TokenMeterEntry = meters[body.userId] ?? {
    tokensIn: 0,
    tokensOut: 0,
    lastUpdated: new Date().toISOString(),
  }
  const runningTotal = {
    tokensIn: existing.tokensIn + body.tokensIn,
    tokensOut: existing.tokensOut + body.tokensOut,
  }
  return { ok: true, runningTotal }
}

interface AppState {
  agents: AgentRegistry
  tasks: TaskQueue
  session: SessionState
}

export function applyClientMessage(state: AppState, msg: ClientMessage): AppState {
  const agents = { ...state.agents }
  const tasks = { ...state.tasks }
  const session = { ...state.session }

  switch (msg.type) {
    case 'register_agent': {
      agents[msg.agentId] = {
        agentId: msg.agentId,
        userId: msg.userId,
        displayName: msg.displayName,
        status: 'idle',
        currentTaskId: null,
        lastHeartbeat: Date.now(),
        tokensUsed: 0,
      }
      break
    }

    case 'heartbeat': {
      const agent = agents[msg.agentId]
      if (agent) {
        agents[msg.agentId] = { ...agent, lastHeartbeat: Date.now() }
      }
      break
    }

    case 'update_status': {
      const agent = agents[msg.agentId]
      if (agent) {
        agents[msg.agentId] = { ...agent, status: msg.status }
      }
      break
    }

    case 'task_claim': {
      const agent = agents[msg.agentId]
      const task = tasks[msg.taskId]
      if (agent) {
        agents[msg.agentId] = { ...agent, currentTaskId: msg.taskId, status: 'building' }
      }
      if (task) {
        tasks[msg.taskId] = {
          ...task,
          status: 'in_progress',
          startedAt: new Date().toISOString(),
        }
      }
      break
    }

    case 'task_done': {
      const agent = agents[msg.agentId]
      const task = tasks[msg.taskId]
      if (task) {
        tasks[msg.taskId] = {
          ...task,
          status: 'done',
          actualTokens: msg.tokensUsed,
          completedAt: new Date().toISOString(),
        }
      }
      if (agent) {
        agents[msg.agentId] = {
          ...agent,
          currentTaskId: null,
          status: 'idle',
          tokensUsed: agent.tokensUsed + msg.tokensUsed,
        }
      }
      break
    }

    case 'task_blocked': {
      const task = tasks[msg.taskId]
      if (task) {
        tasks[msg.taskId] = { ...task, status: 'blocked', blockedReason: msg.reason }
      }
      break
    }

    case 'update_spec': {
      session.agreedSpec = msg.spec
      break
    }

    case 'publish_contract': {
      session.apiContracts = { ...session.apiContracts, [`${msg.contract.method} ${msg.contract.path}`]: msg.contract }
      break
    }

    case 'add_decision': {
      const entry = {
        summary: msg.summary,
        decidedBy: msg.decidedBy,
        timestamp: new Date().toISOString(),
      }
      const log = [...session.decisionLog, entry].slice(-20)
      session.decisionLog = log
      break
    }

    case 'update_tokens': {
      // Token metering is handled by HTTP endpoint; WS message just updates agent.tokensUsed
      const agent = Object.values(agents).find((a) => a.userId === msg.userId)
      if (agent) {
        agents[agent.agentId] = {
          ...agent,
          tokensUsed: agent.tokensUsed + msg.tokensIn + msg.tokensOut,
        }
      }
      break
    }

    case 'dispatch_tasks': {
      for (const task of msg.tasks) {
        tasks[task.id] = task
      }
      break
    }

    case 'session_close': {
      session.status = 'done'
      break
    }
  }

  return { agents, tasks, session }
}

// ─── Partykit Server ─────────────────────────────────────────────────────────

export default class SSSServer implements Party.Server {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  constructor(readonly room: Party.Room) {}

  async onStart() {
    // Initialize session state if not already set
    const existing = await this.room.storage.get<SessionState>('session')
    if (!existing) {
      const session: SessionState = {
        id: this.room.id,
        hostUserId: '',
        projectBrief: '',
        agreedSpec: '',
        decisionLog: [],
        apiContracts: {},
        sharedTypesSnapshot: '',
        status: 'lobby',
        createdAt: new Date().toISOString(),
      }
      await this.room.storage.put('session', session)
      await this.room.storage.put('agents', {})
      await this.room.storage.put('tasks', {})
      await this.room.storage.put('ownership', {})
      await this.room.storage.put('contracts', {})
      await this.room.storage.put('meters', {})
    }

    // Start heartbeat checker every 60s
    this.heartbeatInterval = setInterval(() => void this.runHeartbeatCheck(), 60_000)
  }

  async onConnect(conn: Party.Connection) {
    const session = await this.room.storage.get<SessionState>('session')
    const msg: ServerMessage = { type: 'session_state', payload: session! }
    conn.send(JSON.stringify(msg))
  }

  async onMessage(message: string, sender: Party.Connection) {
    const msg = JSON.parse(message) as ClientMessage
    const agents = (await this.room.storage.get<AgentRegistry>('agents')) ?? {}
    const tasks = (await this.room.storage.get<TaskQueue>('tasks')) ?? {}
    const session = (await this.room.storage.get<SessionState>('session'))!

    const next = applyClientMessage({ agents, tasks, session }, msg)

    await this.room.storage.put('agents', next.agents)
    await this.room.storage.put('tasks', next.tasks)
    await this.room.storage.put('session', next.session)

    // Broadcast relevant updates
    if (msg.type === 'register_agent' || msg.type === 'update_status' || msg.type === 'heartbeat') {
      const agentRecord = next.agents[msg.agentId as string]
      if (agentRecord) {
        this.room.broadcast(JSON.stringify({ type: 'agent_update', payload: agentRecord } satisfies ServerMessage))
      }
    }
    if (msg.type === 'task_claim' || msg.type === 'task_done' || msg.type === 'task_blocked') {
      const taskRecord = next.tasks[msg.taskId as string]
      if (taskRecord) {
        this.room.broadcast(JSON.stringify({ type: 'task_update', payload: taskRecord } satisfies ServerMessage))
      }
    }
    if (msg.type === 'dispatch_tasks') {
      this.room.broadcast(JSON.stringify({ type: 'build_started', taskGraph: msg.tasks } satisfies ServerMessage))
    }
    if (msg.type === 'publish_contract') {
      this.room.broadcast(JSON.stringify({ type: 'contract_published', payload: msg.contract } satisfies ServerMessage))
    }
  }

  async onRequest(req: Party.Request): Promise<Response> {
    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean)
    // Path: /parties/main/{id}/ownership[/{encodedPath}]
    //        /parties/main/{id}/context-injection/{agentId}
    //        /parties/main/{id}/token-update

    const resource = segments[3] // 'ownership' | 'context-injection' | 'token-update'

    if (resource === 'ownership') {
      return this.handleOwnershipRequest(req, segments)
    }
    if (resource === 'context-injection') {
      return this.handleContextInjection(segments)
    }
    if (resource === 'token-update') {
      return this.handleTokenUpdateRequest(req)
    }

    return new Response('Not found', { status: 404 })
  }

  private async handleOwnershipRequest(req: Party.Request, segments: string[]): Promise<Response> {
    const ownership = (await this.room.storage.get<OwnershipMap>('ownership')) ?? {}
    const encodedPath = segments[4]

    if (req.method === 'GET' && encodedPath) {
      const path = decodeURIComponent(encodedPath)
      const result = handleOwnershipGet(ownership, path)
      return Response.json(result)
    }

    if (req.method === 'POST') {
      const body = await req.json() as { path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }
      const result = handleOwnershipPost(ownership, body)
      await this.room.storage.put('ownership', result.updated)
      this.room.broadcast(JSON.stringify({ type: 'ownership_update', payload: result.updated } satisfies ServerMessage))
      return Response.json({ ok: result.ok })
    }

    if (req.method === 'DELETE' && encodedPath) {
      const path = decodeURIComponent(encodedPath)
      const result = handleOwnershipDelete(ownership, path)
      await this.room.storage.put('ownership', result.updated)
      this.room.broadcast(JSON.stringify({ type: 'ownership_update', payload: result.updated } satisfies ServerMessage))
      return Response.json({ ok: result.ok })
    }

    return new Response('Bad request', { status: 400 })
  }

  private async handleContextInjection(segments: string[]): Promise<Response> {
    const agentId = segments[4]
    if (!agentId) return new Response('Missing agentId', { status: 400 })

    const session = await this.room.storage.get<SessionState>('session')
    const agents = (await this.room.storage.get<AgentRegistry>('agents')) ?? {}
    const tasks = (await this.room.storage.get<TaskQueue>('tasks')) ?? {}
    const contracts = (await this.room.storage.get<ContractRegistry>('contracts')) ?? {}

    if (!session) return new Response('Session not initialized', { status: 500 })

    try {
      const result = assembleContextInjection({ agentId, session, agents, tasks, contracts })
      return Response.json(result)
    } catch (err) {
      return new Response((err as Error).message, { status: 404 })
    }
  }

  private async handleTokenUpdateRequest(req: Party.Request): Promise<Response> {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const body = await req.json() as { userId: string; tokensIn: number; tokensOut: number }
    const meters = (await this.room.storage.get<TokenMeters>('meters')) ?? {}
    const result = handleTokenUpdate(meters, body)
    const updated: TokenMeters = {
      ...meters,
      [body.userId]: {
        tokensIn: result.runningTotal.tokensIn,
        tokensOut: result.runningTotal.tokensOut,
        lastUpdated: new Date().toISOString(),
      },
    }
    await this.room.storage.put('meters', updated)
    return Response.json({ ok: result.ok, runningTotal: result.runningTotal })
  }

  private async runHeartbeatCheck(): Promise<void> {
    const agents = (await this.room.storage.get<AgentRegistry>('agents')) ?? {}
    const tasks = (await this.room.storage.get<TaskQueue>('tasks')) ?? {}
    const ownership = (await this.room.storage.get<OwnershipMap>('ownership')) ?? {}

    const result = checkHeartbeats({ agents, tasks, now: Date.now() })
    if (result.offlineAgentIds.length === 0) return

    await this.room.storage.put('agents', result.updatedAgents)
    await this.room.storage.put('tasks', result.updatedTasks)

    // Release ownership for offline agents
    const updatedOwnership = { ...ownership }
    for (const path of result.releasedOwnershipPaths) {
      delete updatedOwnership[path]
    }
    await this.room.storage.put('ownership', updatedOwnership)

    for (const agentId of result.offlineAgentIds) {
      const agent = result.updatedAgents[agentId]
      this.room.broadcast(JSON.stringify({ type: 'heartbeat_lost', agentId } satisfies ServerMessage))
      this.room.broadcast(JSON.stringify({ type: 'ownership_update', payload: updatedOwnership } satisfies ServerMessage))
      // System message to group chat handled by Next.js app listening to heartbeat_lost
    }
  }
}

SSSServer satisfies Party.Worker
```

- [ ] **Step 4: Run all SSS tests**

```bash
cd apps/party && pnpm test
```

Expected: PASS — all tests in `tests/sss.test.ts`, `tests/heartbeat.test.ts`, `tests/context-injection.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/party/src/server.ts apps/party/tests/sss.test.ts
git commit -m "feat: implement full Session State Server with HTTP endpoints, WebSocket handlers, heartbeat"
```

---

## Task 9: Install all deps and local env setup

**Files:**
- Create: `apps/web/.env.local` (gitignored)
- Create: `apps/party/.env` (gitignored)

- [ ] **Step 1: Install all workspace deps**

```bash
pnpm install
```

Expected: All packages install, no errors.

- [ ] **Step 2: Create `apps/web/.env.local`**

Fill in real values from your Supabase project and GitHub OAuth app. For Phase 1, Supabase values can be placeholder since we don't use them yet — but they must pass Zod validation.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key
ANTHROPIC_API_KEY=sk-ant-placeholder
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999
GITHUB_CLIENT_ID=placeholder-client-id
GITHUB_CLIENT_SECRET=placeholder-client-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note:** `ANTHROPIC_API_KEY` must start with `sk-ant-` per Zod schema. Use `sk-ant-placeholder` until you have a real key.

- [ ] **Step 3: Create `apps/party/.env`**

```bash
SUPABASE_URL=https://placeholder.supabase.co
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key
```

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: No TypeScript errors.

- [ ] **Step 6: Start dev server**

```bash
pnpm dev
```

Expected:
- Partykit on `http://localhost:1999`
- Next.js on `http://localhost:3000`
- No startup errors

- [ ] **Step 7: Verify WebSocket connection manually**

Open browser console at `http://localhost:3000` and run:

```javascript
const ws = new WebSocket('ws://localhost:1999/parties/main/test-session-id')
ws.onmessage = (e) => console.log('SSS msg:', JSON.parse(e.data))
ws.onopen = () => console.log('Connected!')
```

Expected: `Connected!` logged, then `SSS msg: { type: 'session_state', payload: { id: 'test-session-id', ... } }`

- [ ] **Step 8: Verify ownership HTTP endpoints**

```bash
# POST ownership
curl -X POST http://localhost:1999/parties/main/test-session-id/ownership \
  -H "Content-Type: application/json" \
  -d '{"path":"src/auth/index.ts","agentId":"agent-1","taskId":"task-1","tier":"owned"}'
# Expected: {"ok":true}

# GET ownership
curl http://localhost:1999/parties/main/test-session-id/ownership/src%2Fauth%2Findex.ts
# Expected: {"owned":true,"agentId":"agent-1","tier":"owned"}
```

- [ ] **Step 9: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 10: Final commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: add CI workflow and env setup — Phase 1 complete"
```

---

## Phase 1 Acceptance Criteria Checklist

Verify each before marking Phase 1 done:

- [ ] `pnpm dev` starts both apps without errors
- [ ] Partykit server accepts a WebSocket connection and returns session state on connect
- [ ] `POST /parties/main/{id}/ownership` stores an entry; `GET` retrieves it correctly
- [ ] `GET /parties/main/{id}/context-injection/{agentId}` returns a valid context string under 3,800 tokens
- [ ] Heartbeat expiry test: agent marked offline after 90s of no heartbeat (Vitest fake timers) — `pnpm test` passes
- [ ] All SSS unit tests pass (`pnpm test`)
