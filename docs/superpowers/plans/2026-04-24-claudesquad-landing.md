# Claude Squad Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a marketing + docs site for Claude Squad at github.com/kevensavard/claudesquadlanding — landing page at `/` and full setup docs at `/docs`.

**Architecture:** Next.js 16 App Router, fully static (no DB, no auth). Landing page is a single scroll with 8 sections as isolated React components. Docs use `next-mdx-remote/rsc` to render MDX files from `content/docs/` via a catch-all `[[...slug]]` route. Deploy to Vercel with zero config.

**Tech Stack:** Next.js 16, Tailwind CSS, Geist font (via `geist` package), `next-mdx-remote`, pnpm

> **Important:** All work happens in the **claudesquadlanding** repo, not the swarm monorepo. Clone `github.com/kevensavard/claudesquadlanding` and work from there.

---

## File Map

| File | Purpose |
|---|---|
| `app/layout.tsx` | Root layout: Geist font, globals, metadata |
| `app/globals.css` | Base styles: bg-zinc-950 body, scrollbar, selection |
| `app/page.tsx` | Landing page — composes all section components |
| `app/docs/[[...slug]]/page.tsx` | Catch-all docs route — reads MDX, renders with sidebar |
| `lib/docs.ts` | `getDocFiles()` + `getDocContent(slug)` — filesystem helpers |
| `components/nav.tsx` | Sticky nav bar |
| `components/footer.tsx` | Site footer |
| `components/sections/hero.tsx` | Split-screen hero |
| `components/sections/bento-features.tsx` | 4-col bento feature grid |
| `components/sections/how-it-works.tsx` | 6-step horizontal timeline |
| `components/sections/getting-started.tsx` | Two-col: copy + terminal block |
| `components/sections/architecture-diagram.tsx` | 4-node flex diagram |
| `components/sections/why-self-host.tsx` | 3-col card grid |
| `components/sections/footer-cta.tsx` | Centered CTA section |
| `components/docs/sidebar.tsx` | Left-panel doc nav (client component for active state) |
| `components/docs/mdx-components.tsx` | Styled pre, code, blockquote overrides |
| `components/docs/copy-button.tsx` | Client component: copy-to-clipboard for code blocks |
| `content/docs/01-prerequisites.mdx` | Prerequisites doc |
| `content/docs/02-clone-install.mdx` | Clone & install doc |
| `content/docs/03-supabase.mdx` | Supabase setup doc |
| `content/docs/04-github-oauth.mdx` | GitHub OAuth doc |
| `content/docs/05-partykit.mdx` | Partykit deploy doc |
| `content/docs/06-env-vars.mdx` | Env vars reference doc |
| `content/docs/07-deploy-vercel.mdx` | Vercel deploy doc |
| `content/docs/08-troubleshooting.mdx` | Troubleshooting doc |
| `__tests__/lib/docs.test.ts` | Unit tests for `lib/docs.ts` |

---

## Task 1: Scaffold project

**Files:**
- Create: entire project via `create-next-app`
- Modify: `next.config.ts`, `package.json`

- [ ] **Step 1: Clone the repo and scaffold**

```bash
git clone https://github.com/kevensavard/claudesquadlanding.git
cd claudesquadlanding
npx create-next-app@16 . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm
```

When prompted about existing files, choose to merge/overwrite.

- [ ] **Step 2: Install additional dependencies**

```bash
pnpm add next-mdx-remote geist
pnpm add -D jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom jest-environment-node
```

- [ ] **Step 3: Configure Jest**

Create `jest.config.ts`:

```typescript
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
}

export default config
```

Add to `package.json` scripts:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 4: Update next.config.ts**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // next-mdx-remote handles MDX at runtime — no special config needed
}

export default nextConfig
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p components/sections components/docs content/docs __tests__/lib public
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 project with deps"
```

---

## Task 2: Global styles + root layout

**Files:**
- Modify: `app/globals.css`
- Create: `app/layout.tsx`

- [ ] **Step 1: Write globals.css**

```css
@import "tailwindcss";

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  background-color: #09090b;
  color: #fafafa;
  -webkit-font-smoothing: antialiased;
}

::selection {
  background-color: #7c3aed;
  color: #fff;
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: #09090b;
}

::-webkit-scrollbar-thumb {
  background: #27272a;
  border-radius: 3px;
}
```

- [ ] **Step 2: Write app/layout.tsx**

```typescript
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Claude Squad — Multiplayer AI Coding',
  description: 'Invite Claude agents to a shared session. Assign tasks. They work in parallel — committing code, opening PRs, and reporting back in real time. Cost splits across the team automatically.',
  openGraph: {
    title: 'Claude Squad — Multiplayer AI Coding',
    description: '4 agents. 1 session. $5/person.',
    url: 'https://claudesquad.dev',
    siteName: 'Claude Squad',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Run dev server and verify dark background loads**

```bash
pnpm dev
```

Open `http://localhost:3000`. Expect: dark (`#09090b`) background, no errors in console.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "chore: global styles and root layout with Geist font"
```

---

## Task 3: lib/docs.ts + tests

**Files:**
- Create: `lib/docs.ts`
- Create: `__tests__/lib/docs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/docs.test.ts
import path from 'path'
import fs from 'fs'
import { getDocFiles, getDocContent } from '@/lib/docs'

const FIXTURE_DIR = path.join(__dirname, '../fixtures/docs')

// Set env so lib/docs reads from fixture dir in tests
process.env.DOCS_DIR_OVERRIDE = FIXTURE_DIR

beforeAll(() => {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true })
  fs.writeFileSync(path.join(FIXTURE_DIR, '01-prerequisites.mdx'), '# Prerequisites\nContent here.')
  fs.writeFileSync(path.join(FIXTURE_DIR, '02-clone-install.mdx'), '# Clone & Install\nContent here.')
  fs.writeFileSync(path.join(FIXTURE_DIR, '08-troubleshooting.mdx'), '# Troubleshooting\nContent here.')
})

afterAll(() => {
  fs.rmSync(FIXTURE_DIR, { recursive: true })
})

describe('getDocFiles', () => {
  it('returns files sorted by filename', () => {
    const files = getDocFiles()
    expect(files[0].slug).toBe('prerequisites')
    expect(files[1].slug).toBe('clone-install')
    expect(files[2].slug).toBe('troubleshooting')
  })

  it('strips numeric prefix from slug', () => {
    const files = getDocFiles()
    expect(files[0].slug).toBe('prerequisites')
    expect(files[0].filename).toBe('01-prerequisites.mdx')
  })

  it('generates human-readable title from slug', () => {
    const files = getDocFiles()
    expect(files[0].title).toBe('Prerequisites')
    expect(files[1].title).toBe('Clone Install')
  })
})

describe('getDocContent', () => {
  it('returns content for a valid slug', () => {
    const content = getDocContent('prerequisites')
    expect(content).toContain('# Prerequisites')
  })

  it('returns null for unknown slug', () => {
    const content = getDocContent('does-not-exist')
    expect(content).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test
```

Expected: FAIL — `Cannot find module '@/lib/docs'`

- [ ] **Step 3: Implement lib/docs.ts**

```typescript
// lib/docs.ts
import fs from 'fs'
import path from 'path'

const DOCS_DIR = process.env.DOCS_DIR_OVERRIDE
  ?? path.join(process.cwd(), 'content/docs')

export type DocFile = {
  slug: string
  title: string
  filename: string
}

export function getDocFiles(): DocFile[] {
  return fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .sort()
    .map((filename) => {
      const slug = filename.replace(/^\d+-/, '').replace(/\.mdx$/, '')
      const title = slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
      return { slug, title, filename }
    })
}

export function getDocContent(slug: string): string | null {
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.mdx'))
  const match = files.find(
    (f) => f.replace(/^\d+-/, '').replace(/\.mdx$/, '') === slug
  )
  if (!match) return null
  return fs.readFileSync(path.join(DOCS_DIR, match), 'utf-8')
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
pnpm test
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/docs.ts __tests__/lib/docs.test.ts
git commit -m "feat: lib/docs.ts with getDocFiles + getDocContent, tested"
```

---

## Task 4: Nav component

**Files:**
- Create: `components/nav.tsx`

- [ ] **Step 1: Create nav.tsx**

```typescript
// components/nav.tsx
import Link from 'next/link'

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-sm">
      <Link href="/" className="flex items-center gap-2 no-underline">
        <div className="w-5 h-5 bg-white rounded-[4px] flex items-center justify-center flex-shrink-0">
          <div className="w-2.5 h-2.5 bg-zinc-950 rounded-[2px]" />
        </div>
        <span className="text-white text-sm font-bold font-mono tracking-tight">
          claude-squad
        </span>
      </Link>

      <div className="flex items-center gap-6">
        <Link href="/docs" className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors">
          Docs
        </Link>
        <a
          href="https://github.com/kevensavard/Claude-Squad"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
        >
          GitHub ↗
        </a>
        <div className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] px-3 py-1 rounded font-mono">
          npm i claude-squad-skill
        </div>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Verify it renders — add to app/page.tsx temporarily**

```typescript
// app/page.tsx (temporary)
import { Nav } from '@/components/nav'

export default function Home() {
  return <Nav />
}
```

Run `pnpm dev`, open `http://localhost:3000`. Expect: sticky dark nav with logo, links, npm pill.

- [ ] **Step 3: Commit**

```bash
git add components/nav.tsx app/page.tsx
git commit -m "feat: Nav component"
```

---

## Task 5: Hero section

**Files:**
- Create: `components/sections/hero.tsx`

- [ ] **Step 1: Create hero.tsx**

```typescript
// components/sections/hero.tsx
import Link from 'next/link'

function SessionUI() {
  return (
    <div className="flex-1 bg-[#0d0d0f] p-5 flex flex-col gap-3 overflow-hidden">
      <p className="text-zinc-700 text-[9px] font-mono tracking-widest mb-1">
        LIVE SESSION · 3 AGENTS ONLINE
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
        <p className="text-violet-400 text-[9px] font-bold mb-1">you</p>
        <p className="text-zinc-200 text-[10px]">
          "Build the auth flow + dashboard + API layer"
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
        <p className="text-emerald-500 text-[9px] font-bold mb-1">orchestrator</p>
        <p className="text-zinc-200 text-[10px]">
          Splitting into 3 parallel tasks · assigning agents…
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          { agent: 'claude-u1', status: '✓ done', color: 'text-emerald-500', task: 'auth flow', tokens: '1,204 tokens' },
          { agent: 'claude-u2', status: '··· running', color: 'text-amber-400', task: 'dashboard', tokens: '847 tokens' },
          { agent: 'claude-u3', status: '··· running', color: 'text-blue-400', task: 'API layer', tokens: '512 tokens' },
        ].map((a) => (
          <div key={a.agent} className="bg-[#111] border border-zinc-800 rounded-md p-2">
            <p className={`${a.color} text-[8px] font-mono mb-1`}>{a.agent} {a.status}</p>
            <p className="text-zinc-500 text-[9px]">{a.task}</p>
            <p className="text-zinc-700 text-[8px] mt-1">{a.tokens}</p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
        <p className="text-emerald-500 text-[9px] font-bold mb-1">claude-u1</p>
        <p className="text-zinc-200 text-[10px]">
          Branch pushed · PR #42 opened · ready to merge
        </p>
      </div>

      <div className="bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 mt-auto">
        <p className="text-zinc-700 text-[9px] mb-2">Build summary</p>
        <div className="flex justify-between">
          <span className="text-zinc-500 text-[9px]">Total cost</span>
          <span className="text-emerald-500 text-[10px] font-bold">$0.08 · $0.03/person</span>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="flex min-h-[calc(100vh-57px)] border-b border-zinc-900">
      {/* Left */}
      <div className="w-[42%] flex flex-col justify-center px-12 py-16 border-r border-zinc-900">
        <p className="text-zinc-700 text-[9px] font-mono tracking-[3px] uppercase mb-5">
          Multiplayer AI Coding
        </p>
        <h1 className="text-zinc-100 text-5xl font-black leading-[1.0] tracking-[-2px] mb-5">
          Every dev.<br />
          Their own<br />
          agent.
        </h1>
        <p className="text-zinc-600 text-sm leading-relaxed mb-4 max-w-sm">
          Connect Claude Code to a shared session. Tasks fan out in parallel.
          Branches merge automatically. Cost splits across the team.
        </p>
        <p className="text-violet-400 text-xs font-mono mb-8">
          4 people → 4× the output → $5/person on a $20 project.
        </p>
        <div className="flex items-center gap-3 mb-8">
          <a
            href="https://github.com/kevensavard/Claude-Squad"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-zinc-950 text-xs font-bold px-5 py-2.5 rounded-md hover:bg-zinc-100 transition-colors"
          >
            Self-Host for Free →
          </a>
          <a
            href="https://github.com/kevensavard/Claude-Squad"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-transparent border border-zinc-800 text-zinc-400 text-xs px-5 py-2.5 rounded-md hover:border-zinc-600 transition-colors flex items-center gap-2"
          >
            <span className="text-amber-400">★</span> Star on GitHub
          </a>
        </div>
        <p className="text-zinc-700 text-[9px] font-mono tracking-[2px]">
          MIT · FREE TIER INFRA · NO VENDOR LOCK-IN
        </p>
      </div>

      {/* Right */}
      <SessionUI />
    </section>
  )
}
```

- [ ] **Step 2: Add to page.tsx and verify**

```typescript
// app/page.tsx
import { Nav } from '@/components/nav'
import { Hero } from '@/components/sections/hero'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
      </main>
    </>
  )
}
```

Run `pnpm dev`. Verify: split-screen hero, left text + CTAs, right fake session UI with task cards. Should feel like a live interface.

- [ ] **Step 3: Commit**

```bash
git add components/sections/hero.tsx app/page.tsx
git commit -m "feat: Hero section — split screen with fake session UI"
```

---

## Task 6: Bento features grid

**Files:**
- Create: `components/sections/bento-features.tsx`

- [ ] **Step 1: Create bento-features.tsx**

```typescript
// components/sections/bento-features.tsx

function Label({ children }: { children: string }) {
  return (
    <p className="text-zinc-700 text-[8px] font-mono tracking-[3px] uppercase mb-3">
      {children}
    </p>
  )
}

function Cell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#111] border border-[#1e1e1e] rounded-xl p-5 ${className}`}>
      {children}
    </div>
  )
}

function TokenMathCell() {
  const rows = [
    { label: '1 dev', pct: 100, cost: '$40', color: 'bg-red-500' },
    { label: '4 devs', pct: 25, cost: '$10', color: 'bg-amber-400' },
    { label: '8 devs', pct: 12, cost: '$5', color: 'bg-emerald-500' },
  ]
  return (
    <Cell className="col-span-2">
      <Label>Shared Token Cost</Label>
      <p className="text-zinc-100 text-base font-black leading-tight tracking-tight mb-5">
        More people.<br />Less per person.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="text-zinc-600 text-[10px] font-mono w-14">{r.label}</span>
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full ${r.color} rounded-full`} style={{ width: `${r.pct}%` }} />
            </div>
            <span className={`text-[11px] font-bold font-mono w-8 text-right ${r.pct === 12 ? 'text-emerald-500' : 'text-zinc-300'}`}>
              {r.cost}
            </span>
          </div>
        ))}
      </div>
    </Cell>
  )
}

function ParallelExecCell() {
  return (
    <Cell>
      <Label>Parallel Exec</Label>
      <div className="flex flex-col gap-1.5 mb-4">
        <div className="h-1.5 bg-emerald-500 rounded-full opacity-80" />
        <div className="h-1.5 bg-blue-500 rounded-full opacity-80 w-[80%]" />
        <div className="h-1.5 bg-violet-400 rounded-full opacity-80 w-[90%]" />
      </div>
      <p className="text-zinc-100 text-xs font-bold">All agents run at once</p>
      <p className="text-zinc-600 text-[10px] mt-1">Deps wait. Rest runs.</p>
    </Cell>
  )
}

function MCPCell() {
  return (
    <Cell>
      <Label>Claude Code MCP</Label>
      <div className="bg-black rounded-md p-3 font-mono text-[9px] leading-relaxed mb-3">
        <span className="text-zinc-600">$ </span>
        <span className="text-zinc-200">npx claude-squad-skill</span>
        <br />
        <span className="text-emerald-500">✓ </span>
        <span className="text-zinc-600">MCP registered</span>
        <br />
        <span className="text-emerald-500">✓ </span>
        <span className="text-zinc-600">agent online</span>
      </div>
      <p className="text-zinc-100 text-xs font-bold">One command</p>
    </Cell>
  )
}

function SimpleCell({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <Cell>
      <Label>{label}</Label>
      <p className="text-zinc-100 text-xs font-bold mb-1.5">{title}</p>
      <p className="text-zinc-600 text-[10px] leading-relaxed">{body}</p>
    </Cell>
  )
}

function SessionSummaryCell() {
  return (
    <Cell className="col-span-2 flex items-center gap-6">
      <div className="flex-1">
        <Label>Session Summary</Label>
        <p className="text-zinc-100 text-xs font-bold mb-1.5">Full build report after every session</p>
        <p className="text-zinc-600 text-[10px] leading-relaxed">
          PR link · per-user token cost · full message history
        </p>
      </div>
      <div className="flex-shrink-0 bg-zinc-950 border border-zinc-800 rounded-lg p-3 min-w-[100px]">
        <p className="text-zinc-700 text-[8px] font-mono mb-2">COST BREAKDOWN</p>
        {['u1 · $0.03', 'u2 · $0.03', 'u3 · $0.02'].map((row) => (
          <div key={row} className="flex justify-between text-[9px] leading-relaxed">
            <span className="text-zinc-600">{row.split(' · ')[0]}</span>
            <span className="text-zinc-300">{row.split(' · ')[1]}</span>
          </div>
        ))}
      </div>
    </Cell>
  )
}

export function BentoFeatures() {
  return (
    <section className="px-8 py-16 border-b border-zinc-900">
      <div className="grid grid-cols-4 gap-3">
        <TokenMathCell />
        <ParallelExecCell />
        <MCPCell />

        <SimpleCell
          label="Auto Merge + PR"
          title="Branches merge automatically"
          body="squad/session → PR opened. No manual merging."
        />
        <SimpleCell
          label="GitHub Native"
          title="Commit. Branch. PR."
          body="Each agent has its own branch. All automated."
        />
        <SessionSummaryCell />

        <SimpleCell
          label="Token Metering"
          title="Real-time per-agent"
          body="Budget bars in the sidebar. No black boxes."
        />
        <SimpleCell
          label="Proposal Editing"
          title="Modify before you build"
          body="Edit task titles, agents, deps inline. Then approve."
        />
        <SimpleCell
          label="Invite Flow"
          title="Share a link"
          body="Teammates join with GitHub. No admin setup."
        />
        <SimpleCell
          label="Self-Hosted"
          title="Your infra. MIT license."
          body="Vercel + Supabase + Partykit. All free tier."
        />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add to page.tsx and verify**

```typescript
// app/page.tsx
import { Nav } from '@/components/nav'
import { Hero } from '@/components/sections/hero'
import { BentoFeatures } from '@/components/sections/bento-features'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <BentoFeatures />
      </main>
    </>
  )
}
```

Verify: 4-column grid, token math spanning 2 cols with bar chart, session summary spanning 2 cols. No layout overflow.

- [ ] **Step 3: Commit**

```bash
git add components/sections/bento-features.tsx app/page.tsx
git commit -m "feat: BentoFeatures grid — 10 feature cells"
```

---

## Task 7: How It Works section

**Files:**
- Create: `components/sections/how-it-works.tsx`

- [ ] **Step 1: Create how-it-works.tsx**

```typescript
// components/sections/how-it-works.tsx

const STEPS = [
  { n: '1', label: 'Describe goal', body: 'Type what to build in chat' },
  { n: '2', label: 'Orchestrator plans', body: 'Tasks split, agents assigned' },
  { n: '3', label: 'Review proposal', body: 'Modify or approve inline' },
  { n: '4', label: 'Agents run in parallel', body: 'Deps wait, rest executes' },
  { n: '5', label: 'Auto merge', body: 'All branches → one PR' },
  { n: '✓', label: 'Build summary', body: 'Cost breakdown, PR link', done: true },
] as const

export function HowItWorks() {
  return (
    <section className="px-8 py-16 border-b border-zinc-900">
      <p className="text-zinc-700 text-[9px] font-mono tracking-[3px] uppercase mb-2">
        How It Works
      </p>
      <h2 className="text-zinc-100 text-3xl font-black tracking-tight mb-12">
        Six steps. One session.
      </h2>

      <div className="relative flex items-start justify-between">
        {/* connector line */}
        <div className="absolute top-4 left-[4%] right-[4%] h-px bg-zinc-800" />

        {STEPS.map((step) => (
          <div key={step.n} className="relative z-10 flex flex-col items-center text-center flex-1 px-2">
            <div
              className={`w-8 h-8 rounded-full border flex items-center justify-center mb-4 text-xs font-black font-mono bg-zinc-950 ${
                'done' in step && step.done
                  ? 'border-emerald-500 text-emerald-500'
                  : 'border-zinc-800 text-violet-400'
              }`}
            >
              {step.n}
            </div>
            <p className="text-zinc-200 text-[10px] font-bold mb-1.5">{step.label}</p>
            <p className="text-zinc-600 text-[9px] leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add to page.tsx and verify**

```typescript
import { HowItWorks } from '@/components/sections/how-it-works'
// add <HowItWorks /> after <BentoFeatures />
```

Verify: 6 numbered circles, horizontal connector line between them, step 6 circle is green with ✓.

- [ ] **Step 3: Commit**

```bash
git add components/sections/how-it-works.tsx app/page.tsx
git commit -m "feat: HowItWorks timeline section"
```

---

## Task 8: Getting Started section

**Files:**
- Create: `components/sections/getting-started.tsx`

- [ ] **Step 1: Create getting-started.tsx**

```typescript
// components/sections/getting-started.tsx
import Link from 'next/link'

export function GettingStarted() {
  return (
    <section className="px-8 py-16 border-b border-zinc-900 flex gap-16 items-start">
      {/* Left */}
      <div className="w-72 flex-shrink-0">
        <p className="text-zinc-700 text-[9px] font-mono tracking-[3px] uppercase mb-2">
          Get Started
        </p>
        <h2 className="text-zinc-100 text-3xl font-black tracking-tight mb-4">
          One command<br />to connect.
        </h2>
        <p className="text-zinc-600 text-sm leading-relaxed mb-6">
          Claude Code detected automatically. MCP registered. Agent online in seconds.
        </p>
        <Link
          href="/docs"
          className="inline-block bg-white text-zinc-950 text-xs font-bold px-5 py-2.5 rounded-md hover:bg-zinc-100 transition-colors"
        >
          Full setup guide →
        </Link>
      </div>

      {/* Right: terminal */}
      <div className="flex-1 bg-black border border-zinc-800 rounded-xl p-6">
        <div className="flex gap-1.5 mb-5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-70" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 opacity-70" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 opacity-70" />
        </div>
        <pre className="font-mono text-xs leading-loose">
          <span className="text-zinc-600"># 1. Clone and deploy (see /docs){'\n'}</span>
          <span className="text-zinc-600"># 2. Connect your agent{'\n'}</span>
          {'\n'}
          <span className="text-violet-400">$</span>
          <span className="text-zinc-200"> npx claude-squad-skill connect \{'\n'}</span>
          <span className="text-zinc-600">    --session &lt;id&gt; --agent &lt;you&gt; --role orchestrator{'\n'}</span>
          {'\n'}
          <span className="text-emerald-500">✓</span>
          <span className="text-zinc-500"> Claude Code detected{'\n'}</span>
          <span className="text-emerald-500">✓</span>
          <span className="text-zinc-500"> MCP server registered{'\n'}</span>
          <span className="text-emerald-500">✓</span>
          <span className="text-zinc-500"> Connected · agent online </span>
          <span className="text-violet-400">█</span>
        </pre>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add to page.tsx and verify**

```typescript
import { GettingStarted } from '@/components/sections/getting-started'
// add <GettingStarted /> after <HowItWorks />
```

Verify: two-column layout, left text + button, right terminal block with proper monospace.

- [ ] **Step 3: Commit**

```bash
git add components/sections/getting-started.tsx app/page.tsx
git commit -m "feat: GettingStarted section with terminal block"
```

---

## Task 9: Architecture diagram section

**Files:**
- Create: `components/sections/architecture-diagram.tsx`

- [ ] **Step 1: Create architecture-diagram.tsx**

```typescript
// components/sections/architecture-diagram.tsx

const NODES = [
  { name: 'Vercel', desc: 'Next.js web app', connector: '── WebSocket ──' },
  { name: 'Partykit', desc: 'Session state server', connector: '── WebSocket ──' },
  { name: 'squad-skill', desc: 'Local CLI agent', connector: '────────────' },
  { name: 'Supabase', desc: 'DB + Auth + Realtime', connector: null },
]

export function ArchitectureDiagram() {
  return (
    <section className="px-8 py-16 border-b border-zinc-900">
      <p className="text-zinc-700 text-[9px] font-mono tracking-[3px] uppercase mb-2">
        Architecture
      </p>
      <h2 className="text-zinc-100 text-3xl font-black tracking-tight mb-10">
        Built on free-tier infra.
      </h2>

      <div className="flex items-center justify-center overflow-x-auto gap-0">
        {NODES.map((node) => (
          <div key={node.name} className="flex items-center">
            <div className="bg-[#111] border border-zinc-800 rounded-xl px-5 py-4 text-center min-w-[110px]">
              <p className="text-violet-400 text-xs font-bold mb-1">{node.name}</p>
              <p className="text-zinc-600 text-[9px]">{node.desc}</p>
            </div>
            {node.connector && (
              <span className="text-zinc-700 text-xs font-mono px-2 whitespace-nowrap">
                {node.connector}
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-zinc-700 text-[9px] font-mono tracking-[3px] mt-5">
        ALL FREE TIER COMPATIBLE
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Add to page.tsx and verify**

```typescript
import { ArchitectureDiagram } from '@/components/sections/architecture-diagram'
// add <ArchitectureDiagram /> after <GettingStarted />
```

Verify: 4 nodes in a horizontal row connected by text connectors.

- [ ] **Step 3: Commit**

```bash
git add components/sections/architecture-diagram.tsx app/page.tsx
git commit -m "feat: ArchitectureDiagram section"
```

---

## Task 10: Why Self-Host + Footer CTA + Footer

**Files:**
- Create: `components/sections/why-self-host.tsx`
- Create: `components/sections/footer-cta.tsx`
- Create: `components/footer.tsx`

- [ ] **Step 1: Create why-self-host.tsx**

```typescript
// components/sections/why-self-host.tsx

const CARDS = [
  {
    icon: '⌗',
    title: 'No API key lock-in',
    body: "Every agent uses their own Anthropic key locally. Your keys never touch the server.",
  },
  {
    icon: '◈',
    title: 'Free-tier infrastructure',
    body: 'Vercel + Supabase + Partykit — all free tier. Deploy at zero cost.',
  },
  {
    icon: '◻',
    title: 'MIT licensed',
    body: 'Open source, no usage limits, no subscriptions. Fork it, modify it, ship it.',
  },
]

export function WhySelfHost() {
  return (
    <section className="px-8 py-16 border-b border-zinc-900">
      <p className="text-zinc-700 text-[9px] font-mono tracking-[3px] uppercase mb-2">
        Why Self-Host
      </p>
      <h2 className="text-zinc-100 text-3xl font-black tracking-tight mb-10">
        Your keys. Your data. Your agents.
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <div key={c.title} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
            <div className="text-emerald-500 text-2xl mb-4">{c.icon}</div>
            <p className="text-zinc-100 text-sm font-bold mb-2">{c.title}</p>
            <p className="text-zinc-600 text-xs leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create footer-cta.tsx**

```typescript
// components/sections/footer-cta.tsx

export function FooterCta() {
  return (
    <section className="px-8 py-20 border-b border-zinc-900 text-center">
      <h2 className="text-zinc-100 text-4xl font-black tracking-tight mb-3">
        Ready to ship faster?
      </h2>
      <p className="text-zinc-600 text-sm mb-8">
        Self-host in minutes. Free. No credit card.
      </p>
      <div className="flex items-center justify-center gap-3">
        <a
          href="https://github.com/kevensavard/Claude-Squad"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white text-zinc-950 text-sm font-bold px-6 py-3 rounded-md hover:bg-zinc-100 transition-colors"
        >
          Self-Host for Free →
        </a>
        <a
          href="https://github.com/kevensavard/Claude-Squad"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-transparent border border-zinc-800 text-zinc-400 text-sm px-6 py-3 rounded-md hover:border-zinc-600 transition-colors flex items-center gap-2"
        >
          <span className="text-amber-400">★</span> Star on GitHub
        </a>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create footer.tsx**

```typescript
// components/footer.tsx
import Link from 'next/link'

export function Footer() {
  return (
    <footer className="px-8 py-5 flex items-center justify-between">
      <span className="text-zinc-700 text-[10px] font-mono">claude-squad · MIT License</span>
      <div className="flex items-center gap-5">
        {[
          { label: 'GitHub', href: 'https://github.com/kevensavard/Claude-Squad' },
          { label: 'Docs', href: '/docs' },
          { label: 'npm', href: 'https://www.npmjs.com/package/claude-squad-skill' },
        ].map((l) => (
          <a
            key={l.label}
            href={l.href}
            className="text-zinc-700 text-[10px] hover:text-zinc-400 transition-colors"
            {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {l.label}
          </a>
        ))}
      </div>
    </footer>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/sections/why-self-host.tsx components/sections/footer-cta.tsx components/footer.tsx
git commit -m "feat: WhySelfHost, FooterCta, Footer components"
```

---

## Task 11: Wire the full landing page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Write final app/page.tsx**

```typescript
// app/page.tsx
import { Nav } from '@/components/nav'
import { Hero } from '@/components/sections/hero'
import { BentoFeatures } from '@/components/sections/bento-features'
import { HowItWorks } from '@/components/sections/how-it-works'
import { GettingStarted } from '@/components/sections/getting-started'
import { ArchitectureDiagram } from '@/components/sections/architecture-diagram'
import { WhySelfHost } from '@/components/sections/why-self-host'
import { FooterCta } from '@/components/sections/footer-cta'
import { Footer } from '@/components/footer'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <BentoFeatures />
        <HowItWorks />
        <GettingStarted />
        <ArchitectureDiagram />
        <WhySelfHost />
        <FooterCta />
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: Full visual QA of the landing page**

Run `pnpm dev`. Scroll through the entire page. Verify:
- Nav is sticky on scroll
- Hero fills viewport, both columns render
- Bento grid: 2-col cells don't break layout
- How it works: timeline line appears behind circles
- Getting started: terminal block renders monospace correctly
- Architecture: 4 nodes in a row
- Why self-host: 3 cards equal height
- Footer CTA: centered, both buttons visible
- Footer: at bottom with links

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire complete landing page"
```

---

## Task 12: Copy button + MDX components

**Files:**
- Create: `components/docs/copy-button.tsx`
- Create: `components/docs/mdx-components.tsx`

- [ ] **Step 1: Create copy-button.tsx**

```typescript
// components/docs/copy-button.tsx
'use client'

import { useState } from 'react'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="absolute top-3 right-3 text-[9px] font-mono text-zinc-600 hover:text-zinc-300 transition-colors bg-zinc-900 border border-zinc-800 px-2 py-1 rounded"
    >
      {copied ? 'copied!' : 'copy'}
    </button>
  )
}
```

- [ ] **Step 2: Create mdx-components.tsx**

```typescript
// components/docs/mdx-components.tsx
import type { MDXComponents } from 'mdx/types'
import { CopyButton } from './copy-button'

export const mdxComponents: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="text-zinc-100 text-3xl font-black tracking-tight mb-6 mt-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-zinc-100 text-xl font-bold tracking-tight mb-4 mt-10">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-zinc-200 text-base font-bold mb-3 mt-6">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-zinc-400 text-sm leading-relaxed mb-4">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="text-zinc-400 text-sm leading-relaxed mb-4 ml-4 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="text-zinc-400 text-sm leading-relaxed mb-4 ml-4 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="text-zinc-400">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} className="text-violet-400 hover:text-violet-300 underline transition-colors">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="bg-zinc-900 border border-zinc-800 text-violet-300 font-mono text-xs px-1.5 py-0.5 rounded">
      {children}
    </code>
  ),
  pre: ({ children }) => {
    const text = (children as any)?.props?.children ?? ''
    return (
      <div className="relative mb-6">
        <pre className="bg-black border border-zinc-800 rounded-xl p-5 overflow-x-auto font-mono text-xs text-zinc-300 leading-loose">
          {children}
        </pre>
        <CopyButton text={typeof text === 'string' ? text : ''} />
      </div>
    )
  },
  blockquote: ({ children }) => (
    <aside className="border-l-2 border-violet-500 bg-violet-500/5 px-4 py-3 rounded-r-lg mb-4 text-zinc-400 text-sm">
      {children}
    </aside>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="text-left text-zinc-400 font-semibold text-xs border-b border-zinc-800 pb-2 pr-4">{children}</th>
  ),
  td: ({ children }) => (
    <td className="text-zinc-500 text-xs py-2 pr-4 border-b border-zinc-900">{children}</td>
  ),
}
```

- [ ] **Step 3: Commit**

```bash
git add components/docs/copy-button.tsx components/docs/mdx-components.tsx
git commit -m "feat: MDX components and CopyButton"
```

---

## Task 13: Docs sidebar

**Files:**
- Create: `components/docs/sidebar.tsx`

- [ ] **Step 1: Create sidebar.tsx**

```typescript
// components/docs/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { DocFile } from '@/lib/docs'

export function Sidebar({ files }: { files: DocFile[] }) {
  const pathname = usePathname()

  return (
    <aside className="w-60 flex-shrink-0 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto border-r border-zinc-900 py-8 px-6">
      <p className="text-zinc-700 text-[8px] font-mono tracking-[3px] uppercase mb-4">
        Setup Guide
      </p>
      <nav className="flex flex-col gap-1">
        {files.map((f) => {
          const href = `/docs/${f.slug}`
          const active = pathname === href || (pathname === '/docs' && f.slug === files[0].slug)
          return (
            <Link
              key={f.slug}
              href={href}
              className={`text-xs px-3 py-2 rounded-md transition-colors ${
                active
                  ? 'bg-violet-500/10 text-violet-400 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {f.title}
            </Link>
          )
        })}
      </nav>

      <div className="mt-8 pt-6 border-t border-zinc-900">
        <Link
          href="/"
          className="text-zinc-700 text-[10px] hover:text-zinc-400 transition-colors"
        >
          ← Back to homepage
        </Link>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/docs/sidebar.tsx
git commit -m "feat: Docs sidebar with active state"
```

---

## Task 14: Docs route

**Files:**
- Create: `app/docs/[[...slug]]/page.tsx`

- [ ] **Step 1: Create docs directory**

```bash
mkdir -p app/docs/'[[...slug]]'
```

- [ ] **Step 2: Create page.tsx**

```typescript
// app/docs/[[...slug]]/page.tsx
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { getDocFiles, getDocContent } from '@/lib/docs'
import { Sidebar } from '@/components/docs/sidebar'
import { mdxComponents } from '@/components/docs/mdx-components'
import { Nav } from '@/components/nav'

export async function generateStaticParams() {
  const files = getDocFiles()
  return [
    { slug: [] }, // /docs → redirects to first doc
    ...files.map((f) => ({ slug: [f.slug] })),
  ]
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const files = getDocFiles()
  const activeSlug = slug?.[0] ?? files[0]?.slug

  if (!activeSlug) notFound()

  const content = getDocContent(activeSlug)
  if (!content) notFound()

  const activeFile = files.find((f) => f.slug === activeSlug)

  return (
    <>
      <Nav />
      <div className="flex min-h-screen">
        <Sidebar files={files} />
        <main className="flex-1 px-12 py-10 max-w-3xl">
          <MDXRemote source={content} components={mdxComponents} />
        </main>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add 'app/docs/[[...slug]]/page.tsx'
git commit -m "feat: docs catch-all route with MDX rendering and sidebar"
```

---

## Task 15: MDX content — all 8 docs

**Files:**
- Create: all files in `content/docs/`

- [ ] **Step 1: Create 01-prerequisites.mdx**

```markdown
# Prerequisites

Before you start, make sure you have the following installed and configured.

## Required tools

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm install -g pnpm@9` |
| Git | any | |

## Required accounts

| Service | Notes |
|---|---|
| [Supabase](https://supabase.com) | Free tier works |
| [Partykit](https://partykit.io) | Free tier works |
| [Vercel](https://vercel.com) | Free tier works |
| [GitHub](https://github.com) | For OAuth App + repo operations |
| [Anthropic](https://console.anthropic.com) | Each agent uses their own API key locally |

> **Note:** The Anthropic API key is never stored on the server. Each team member enters their own key locally when connecting an agent.
```

- [ ] **Step 2: Create 02-clone-install.mdx**

```markdown
# Clone & Install

## 1. Clone the repo

```bash
git clone https://github.com/kevensavard/Claude-Squad.git
cd Claude-Squad
```

## 2. Install dependencies

```bash
pnpm install
```

## 3. Verify the monorepo structure

```
Claude-Squad/
  apps/
    web/     ← Next.js app
    party/   ← Partykit session server
  packages/
    squad-skill/
    agent-runner/
    types/
```

You're now ready to configure each service.
```

- [ ] **Step 3: Create 03-supabase.mdx**

```markdown
# Set Up Supabase

## 1. Create a project

Go to [supabase.com](https://supabase.com) and create a new project. Note your **Project URL** and **API keys** from **Settings → API**.

## 2. Run migrations

Open the **SQL Editor** in your Supabase dashboard. Run each file in order:

```
apps/web/supabase/migrations/001_initial_schema.sql
apps/web/supabase/migrations/002_rls_policies.sql
apps/web/supabase/migrations/003_realtime.sql
apps/web/supabase/migrations/004_indexes.sql
```

## 3. Enable Realtime

Go to **Database → Replication** and toggle the `messages` table to enable Realtime.

## 4. Copy your keys

You'll need:

- `NEXT_PUBLIC_SUPABASE_URL` — your Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon / public` key
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` key
```

- [ ] **Step 4: Create 04-github-oauth.mdx**

```markdown
# Set Up GitHub OAuth

## 1. Create an OAuth App

Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.

Fill in:

- **Application name:** Claude Squad
- **Homepage URL:** your Vercel URL (or `http://localhost:3000` for local dev)
- **Authorization callback URL:** `https://your-app.vercel.app/auth/callback`

> For local dev, use `http://localhost:3000/auth/callback` as the callback URL.

## 2. Copy the credentials

- **Client ID** → `GITHUB_CLIENT_ID`
- Click **Generate a new client secret** → `GITHUB_CLIENT_SECRET`

## 3. Enable GitHub in Supabase

In your Supabase dashboard: **Authentication → Providers → GitHub**. Enable it and paste your Client ID and Client Secret.
```

- [ ] **Step 5: Create 05-partykit.mdx**

```markdown
# Deploy Partykit

## 1. Authenticate

```bash
cd apps/party
npx partykit login
```

This opens a browser to authenticate with your Partykit account.

## 2. Deploy

```bash
npx partykit deploy
```

Note the `.partykit.dev` URL printed at the end. That becomes `NEXT_PUBLIC_PARTYKIT_HOST`.

## 3. Local development

For local dev, run the Partykit server instead of deploying:

```bash
npx partykit dev
```

This starts the server at `localhost:1999`. Set `NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999` in your local `.env.local`.
```

- [ ] **Step 6: Create 06-env-vars.mdx**

```markdown
# Environment Variables

## Setup

Copy the example file:

```bash
cp .env.example apps/web/.env.local
```

Then fill in every value in `apps/web/.env.local`.

## Full reference

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `NEXT_PUBLIC_PARTYKIT_HOST` | Printed by `npx partykit deploy` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App → Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App → Client Secret |
| `NEXT_PUBLIC_APP_URL` | Your Vercel app URL (or `http://localhost:3000`) |

> **Note:** There is no `ANTHROPIC_API_KEY` on the server. Each agent enters their own key locally via the CLI.

## Verify your setup

Start the dev server and open `/setup`:

```bash
pnpm dev
# open http://localhost:3000/setup
```

Click **Verify** on each step. All four should show a green checkmark before deploying.
```

- [ ] **Step 7: Create 07-deploy-vercel.mdx**

```markdown
# Deploy to Vercel

## 1. Push to GitHub

```bash
git push origin main
```

## 2. Import in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your `Claude-Squad` repo
3. Set **Root Directory** to `apps/web`
4. Add all env vars from `apps/web/.env.local` in the Vercel dashboard
5. Set `NEXT_PUBLIC_PARTYKIT_HOST` to your deployed Partykit domain (not localhost)
6. Set `NEXT_PUBLIC_APP_URL` to your Vercel app URL

## 3. Deploy

Click **Deploy**. Vercel builds and deploys automatically.

## Subsequent deploys

Push to `main` → Vercel redeploys automatically. No manual steps needed.
```

- [ ] **Step 8: Create 08-troubleshooting.mdx**

```markdown
# Troubleshooting

## Agent not appearing in the session

- Make sure the Partykit server is running (deployed or local `npx partykit dev`)
- Check that `NEXT_PUBLIC_PARTYKIT_HOST` matches the actual Partykit URL (no trailing slash, no `https://` prefix for Partykit cloud)
- Run the connect command again — it's safe to reconnect

## "MCP server not found" when connecting Claude Code

- Run `npx claude-squad-skill connect` (not `claude-squad-skill` directly) — the `npx` prefix ensures you get the latest version
- If Claude Code isn't installed, the CLI falls back to API key mode automatically

## Supabase auth callback fails

- Confirm the **Authorization callback URL** in your GitHub OAuth App matches the URL of your deployed app exactly (including `https://`)
- For local dev, make sure you've added `http://localhost:3000/auth/callback` as a second callback URL in the OAuth App

## Merge sequence fails / PR not created

- The user who clicks "Approve & Build" must have their GitHub token stored — make sure they authenticated with GitHub OAuth (not magic link) when signing in
- The repo must exist and the user must have write access

## Agents not receiving tasks

- Confirm the agent is online in the presence sidebar (green dot)
- If the agent disconnects mid-session, run the connect command again to reconnect and it will reclaim its assigned tasks automatically
```

- [ ] **Step 9: Verify docs in browser**

Run `pnpm dev`, open `http://localhost:3000/docs`. Verify:
- Sidebar shows all 8 doc titles
- Active item is highlighted in violet
- MDX content renders with styled headings, code blocks, tables
- Copy button appears on code blocks
- `/docs` redirects to first doc (Prerequisites)
- Navigating between docs updates active state

- [ ] **Step 10: Commit**

```bash
git add content/docs/
git commit -m "docs: add all 8 setup guide MDX files"
```

---

## Task 16: Final QA + deploy to Vercel

**Files:**
- No new files — verification only

- [ ] **Step 1: Run tests**

```bash
pnpm test
```

Expected: all 5 tests pass.

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected: build succeeds, all pages statically generated.

- [ ] **Step 4: Check for build output**

```bash
pnpm start
```

Open `http://localhost:3000`. Verify: production build renders correctly, no hydration warnings in console.

- [ ] **Step 5: Push and deploy**

```bash
git push origin main
```

Import the repo in [vercel.com/new](https://vercel.com/new):
- Root directory: `/` (not `apps/web` — this is a standalone repo)
- No env vars needed (fully static)
- Deploy

- [ ] **Step 6: Verify live URL**

Open the Vercel deployment URL. Verify:
- Landing page loads, all sections visible
- `/docs` loads with sidebar
- Nav links work
- CTAs link to the correct GitHub URL
- No 404s

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: verified build and deployed to Vercel"
git push origin main
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task that implements it |
|---|---|
| Next.js 16 + Tailwind + Geist + MDX | Task 1–2 |
| Nav with npm pill | Task 4 |
| Hero split-screen with fake session UI | Task 5 |
| Bento 10-feature grid | Task 6 |
| How it works 6-step timeline | Task 7 |
| Getting started terminal block | Task 8 |
| Architecture 4-node diagram | Task 9 |
| Why self-host 3 cards | Task 10 |
| Footer CTA + Footer | Task 10 |
| MDX copy button | Task 12 |
| Styled blockquote/pre/code | Task 12 |
| Sidebar auto-generated from files | Task 13 |
| Catch-all docs route | Task 14 |
| All 8 MDX docs | Task 15 |
| Deploy to Vercel | Task 16 |

All spec requirements covered. No placeholders.
