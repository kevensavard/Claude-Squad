# Phase 2 — Group Chat UI + Supabase Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiple browser tabs can join a session and exchange messages in real time, with presence, @mention highlighting, and auth enforcement.

**Architecture:** Next.js 15 App Router pages wired to Supabase for auth, message persistence, and Realtime. Partykit WebSocket used for agent presence (agent status, token meters). @mentions are parsed client-side and highlighted before send — routing to agents is Phase 3. All API routes use the Supabase server client (cookie-based auth).

**Tech Stack:** Next.js 15, Supabase SSR (`@supabase/ssr`), Tailwind CSS v4, Vitest, `partysocket` (Partykit client)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/package.json` | Modify | Add `@supabase/ssr`, `@supabase/supabase-js`, `tailwindcss`, `@tailwindcss/postcss`, `partysocket` |
| `apps/web/postcss.config.mjs` | Create | Tailwind v4 PostCSS plugin |
| `apps/web/src/app/globals.css` | Create | `@import "tailwindcss"` |
| `apps/web/src/app/layout.tsx` | Modify | Add globals.css import |
| `apps/web/src/lib/supabase/client.ts` | Create | Browser Supabase client (singleton) |
| `apps/web/src/lib/supabase/server.ts` | Create | Server Supabase client (cookies) |
| `apps/web/src/middleware.ts` | Create | Auth redirect middleware |
| `apps/web/supabase/migrations/001_initial_schema.sql` | Create | Tables: sessions, session_members, messages, token_usage, profiles |
| `apps/web/supabase/migrations/002_rls_policies.sql` | Create | RLS policies per spec |
| `apps/web/supabase/migrations/003_realtime.sql` | Create | session_token_summary view + grants |
| `apps/web/supabase/migrations/004_indexes.sql` | Create | Query optimization indexes |
| `apps/web/src/types/database.ts` | Create | TypeScript row types matching DB schema |
| `packages/types/src/agent-colors.ts` | Create | AGENT_COLORS palette + getAgentColor() |
| `packages/types/src/index.ts` | Modify | Re-export agent-colors |
| `apps/web/src/lib/mention-parser.ts` | Create | parseMention() pure function |
| `apps/web/src/lib/__tests__/mention-parser.test.ts` | Create | parseMention unit tests |
| `apps/web/src/app/auth/login/page.tsx` | Create | Email + GitHub OAuth login UI |
| `apps/web/src/app/auth/callback/route.ts` | Create | Supabase OAuth callback handler |
| `apps/web/src/app/page.tsx` | Modify | Home: redirect to /new if authed, /auth/login if not |
| `apps/web/src/app/new/page.tsx` | Create | Create session form |
| `apps/web/src/app/api/session/route.ts` | Create | POST /api/session |
| `apps/web/src/app/join/[code]/page.tsx` | Create | Join session via invite code |
| `apps/web/src/app/api/session/join/[inviteCode]/route.ts` | Create | GET /api/session/join/[inviteCode] |
| `apps/web/src/app/session/[id]/page.tsx` | Create | Main session page (server component, loads initial data) |
| `apps/web/src/components/session/SessionLayout.tsx` | Create | Three-column layout shell |
| `apps/web/src/components/chat/MessageList.tsx` | Create | Scrolling message list + Realtime subscription |
| `apps/web/src/components/chat/MessageItem.tsx` | Create | Routes to correct sub-component |
| `apps/web/src/components/chat/HumanMessage.tsx` | Create | Right/left aligned human bubble |
| `apps/web/src/components/chat/AgentMessage.tsx` | Create | Agent bubble with color + mode badge |
| `apps/web/src/components/chat/SystemNotice.tsx` | Create | Centered muted system text |
| `apps/web/src/components/chat/MessageInput.tsx` | Create | Input with @mention autocomplete + highlight |
| `apps/web/src/components/sidebar/PresenceSidebar.tsx` | Create | Members list + agent status (Partykit) |
| `apps/web/src/components/sidebar/AgentStatusPill.tsx` | Create | Colored status pill |
| `apps/web/src/components/sidebar/TokenMeter.tsx` | Create | Token progress bar |
| `apps/web/src/hooks/useRealtimeMessages.ts` | Create | Supabase Realtime INSERT subscription |
| `apps/web/src/hooks/usePartykitSession.ts` | Create | Partykit WebSocket connection + state |

---

## Task 1: Install deps + Tailwind v4 + Supabase clients

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/lib/supabase/client.ts`
- Create: `apps/web/src/lib/supabase/server.ts`
- Modify: `apps/web/src/middleware.ts` (create new)

- [ ] **Step 1: Update `apps/web/package.json` dependencies**

Read the current file, then add:

```json
{
  "dependencies": {
    "@supabase/ssr": "^0.5.0",
    "@supabase/supabase-js": "^2.45.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "partysocket": "^1.0.2"
  }
}
```

Merge into existing dependencies (keep everything already there).

- [ ] **Step 2: Run pnpm install from root**

```bash
cd C:/Users/keven/Documents/swarm && pnpm install
```

Expected: new packages installed, no errors.

- [ ] **Step 3: Create `apps/web/postcss.config.mjs`**

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

- [ ] **Step 4: Create `apps/web/src/app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 5: Update `apps/web/src/app/layout.tsx`**

```tsx
import './globals.css'

export const metadata = { title: 'Squad' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Create `apps/web/src/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 7: Create `apps/web/src/lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from Server Component — cookies set in middleware instead
          }
        },
      },
    }
  )
}

export async function createServiceClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 8: Create `apps/web/src/middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')

  if (!user && !isAuthRoute && !isApiRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 9: Verify Next.js builds without errors**

```bash
cd apps/web && pnpm typecheck
```

Expected: 0 errors (or only errors about missing supabase tables — those come in Task 2).

---

## Task 2: Database migration files

**Files:**
- Create: `apps/web/supabase/migrations/001_initial_schema.sql`
- Create: `apps/web/supabase/migrations/002_rls_policies.sql`
- Create: `apps/web/supabase/migrations/003_realtime.sql`
- Create: `apps/web/supabase/migrations/004_indexes.sql`

These are SQL files to run in Supabase. No unit tests (run manually against Supabase project).

- [ ] **Step 1: Create `apps/web/supabase/migrations/001_initial_schema.sql`**

```sql
-- Enable required extensions
create extension if not exists "uuid-ossp";

-- SESSIONS
create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  host_user_id  uuid references auth.users(id) on delete cascade not null,
  name          text not null default 'Untitled squad',
  invite_code   text unique not null default substring(md5(random()::text), 1, 8),
  github_repo_url text,
  status        text not null default 'lobby'
                  check (status in ('lobby', 'planning', 'building', 'done', 'archived')),
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);

-- SESSION MEMBERS
create table public.session_members (
  session_id    uuid references public.sessions(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  agent_id      text not null,
  display_name  text not null,
  is_host       boolean not null default false,
  joined_at     timestamptz not null default now(),
  primary key (session_id, user_id)
);

create unique index session_members_agent_id_unique
  on public.session_members(session_id, agent_id);

-- MESSAGES
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references public.sessions(id) on delete cascade not null,
  sender_type   text not null check (sender_type in ('human', 'agent', 'system')),
  user_id       uuid references auth.users(id) on delete set null,
  agent_id      text,
  content       text not null,
  mode          text check (mode in ('brainstorm', 'review', 'plan', 'build', 'status', null)),
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index messages_session_created
  on public.messages(session_id, created_at desc);

-- TOKEN USAGE
create table public.token_usage (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references public.sessions(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  task_id       text,
  model         text not null,
  tokens_in     integer not null check (tokens_in >= 0),
  tokens_out    integer not null check (tokens_out >= 0),
  cost_usd      numeric(10, 6),
  recorded_at   timestamptz not null default now()
);

create index token_usage_session_user
  on public.token_usage(session_id, user_id);

-- PROFILES
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  github_username text,
  github_access_token text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
```

- [ ] **Step 2: Create `apps/web/supabase/migrations/002_rls_policies.sql`**

```sql
alter table public.sessions        enable row level security;
alter table public.session_members enable row level security;
alter table public.messages        enable row level security;
alter table public.token_usage     enable row level security;
alter table public.profiles        enable row level security;

-- PROFILES
create policy "profiles_select_any"
  on public.profiles for select using (true);

create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id);

-- SESSIONS
create policy "sessions_select_member"
  on public.sessions for select
  using (
    exists (
      select 1 from public.session_members sm
      where sm.session_id = id and sm.user_id = auth.uid()
    )
  );

create policy "sessions_insert_authenticated"
  on public.sessions for insert
  with check (auth.uid() = host_user_id);

create policy "sessions_update_host"
  on public.sessions for update
  using (auth.uid() = host_user_id);

-- SESSION MEMBERS
create policy "session_members_select_member"
  on public.session_members for select
  using (
    exists (
      select 1 from public.session_members sm
      where sm.session_id = session_members.session_id and sm.user_id = auth.uid()
    )
  );

create policy "session_members_insert_self"
  on public.session_members for insert
  with check (auth.uid() = user_id);

create policy "session_members_delete"
  on public.session_members for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.sessions s
      where s.id = session_id and s.host_user_id = auth.uid()
    )
  );

-- MESSAGES
create policy "messages_select_member"
  on public.messages for select
  using (
    exists (
      select 1 from public.session_members sm
      where sm.session_id = messages.session_id and sm.user_id = auth.uid()
    )
  );

create policy "messages_insert_member"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.session_members sm
      where sm.session_id = messages.session_id and sm.user_id = auth.uid()
    )
    and sender_type = 'human'
    and user_id = auth.uid()
  );

-- TOKEN USAGE
create policy "token_usage_select"
  on public.token_usage for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.sessions s
      where s.id = token_usage.session_id and s.host_user_id = auth.uid()
    )
  );
```

- [ ] **Step 3: Create `apps/web/supabase/migrations/003_realtime.sql`**

```sql
create or replace view public.session_token_summary as
select
  tu.session_id,
  tu.user_id,
  p.display_name,
  sum(tu.tokens_in)  as total_tokens_in,
  sum(tu.tokens_out) as total_tokens_out,
  sum(tu.cost_usd)   as total_cost_usd
from public.token_usage tu
join public.profiles p on p.id = tu.user_id
group by tu.session_id, tu.user_id, p.display_name;

grant select on public.session_token_summary to authenticated;
```

- [ ] **Step 4: Create `apps/web/supabase/migrations/004_indexes.sql`**

```sql
create index sessions_invite_code on public.sessions(invite_code);
create index session_members_user_id on public.session_members(user_id);
create index messages_session_created_asc on public.messages(session_id, created_at asc);
create index token_usage_session_id on public.token_usage(session_id);
```

- [ ] **Step 5: Run migrations against your Supabase project**

In the Supabase dashboard SQL editor, run each file in order (001 → 004).

Then in Supabase dashboard → Realtime → Tables, enable **INSERT** events for the `messages` table.

Update `apps/web/.env.local` with real Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key
```

---

## Task 3: TypeScript DB types + agent colors + mention parser

**Files:**
- Create: `apps/web/src/types/database.ts`
- Create: `packages/types/src/agent-colors.ts`
- Modify: `packages/types/src/index.ts`
- Create: `apps/web/src/lib/mention-parser.ts`
- Create: `apps/web/src/lib/__tests__/mention-parser.test.ts`

- [ ] **Step 1: Create `apps/web/src/types/database.ts`**

TypeScript types matching the DB schema exactly:

```typescript
export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  github_username: string | null
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  host_user_id: string
  name: string
  invite_code: string
  github_repo_url: string | null
  status: 'lobby' | 'planning' | 'building' | 'done' | 'archived'
  created_at: string
  closed_at: string | null
}

export interface SessionMember {
  session_id: string
  user_id: string
  agent_id: string
  display_name: string
  is_host: boolean
  joined_at: string
}

export interface Message {
  id: string
  session_id: string
  sender_type: 'human' | 'agent' | 'system'
  user_id: string | null
  agent_id: string | null
  content: string
  mode: 'brainstorm' | 'review' | 'plan' | 'build' | 'status' | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface TokenUsage {
  id: string
  session_id: string
  user_id: string
  task_id: string | null
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number | null
  recorded_at: string
}
```

- [ ] **Step 2: Create `packages/types/src/agent-colors.ts`**

```typescript
export const AGENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'claude-u1': {
    bg: 'bg-purple-50 dark:bg-purple-950',
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-700 dark:text-purple-300',
  },
  'claude-u2': {
    bg: 'bg-teal-50 dark:bg-teal-950',
    border: 'border-teal-300 dark:border-teal-700',
    text: 'text-teal-700 dark:text-teal-300',
  },
  'claude-u3': {
    bg: 'bg-amber-50 dark:bg-amber-950',
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-700 dark:text-amber-300',
  },
  'claude-u4': {
    bg: 'bg-rose-50 dark:bg-rose-950',
    border: 'border-rose-300 dark:border-rose-700',
    text: 'text-rose-700 dark:text-rose-300',
  },
}

export function getAgentColor(agentId: string): { bg: string; border: string; text: string } {
  if (agentId in AGENT_COLORS) return AGENT_COLORS[agentId]!
  const keys = Object.keys(AGENT_COLORS)
  const digits = agentId.replace(/\D/g, '')
  const index = digits.length > 0 ? parseInt(digits, 10) % keys.length : 0
  return AGENT_COLORS[keys[index]!]!
}
```

- [ ] **Step 3: Update `packages/types/src/index.ts`**

Read the current file, then append:

```typescript
export * from './agent-colors.js'
```

- [ ] **Step 4: Create `apps/web/src/lib/mention-parser.ts`**

```typescript
export interface ParsedMessage {
  raw: string
  mentions: string[]
  isAllMention: boolean
  cleanContent: string
}

export function parseMention(raw: string): ParsedMessage {
  const mentionRegex = /@(claude-\d+|all|agents)/gi
  const mentions: string[] = []
  let match

  while ((match = mentionRegex.exec(raw)) !== null) {
    const tag = match[1]!.toLowerCase()
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

- [ ] **Step 5: Write failing test for mention parser**

Create `apps/web/src/lib/__tests__/mention-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseMention } from '../mention-parser.js'

describe('parseMention', () => {
  it('parses single agent mention', () => {
    const result = parseMention('hey @claude-1 what do you think?')
    expect(result.mentions).toContain('claude-1')
    expect(result.isAllMention).toBe(false)
    expect(result.cleanContent).toBe('hey what do you think?')
  })

  it('parses @all mention', () => {
    const result = parseMention('@all update me on the status')
    expect(result.isAllMention).toBe(true)
    expect(result.mentions).toContain('all')
  })

  it('parses @agents as @all', () => {
    const result = parseMention('@agents what is the status?')
    expect(result.isAllMention).toBe(true)
    expect(result.mentions).toContain('all')
    expect(result.mentions).not.toContain('agents')
  })

  it('deduplicates repeated mentions', () => {
    const result = parseMention('@claude-1 and @claude-1 again')
    expect(result.mentions).toHaveLength(1)
    expect(result.mentions[0]).toBe('claude-1')
  })

  it('parses multiple distinct mentions', () => {
    const result = parseMention('@claude-1 and @claude-2 check this out')
    expect(result.mentions).toContain('claude-1')
    expect(result.mentions).toContain('claude-2')
    expect(result.mentions).toHaveLength(2)
  })

  it('returns empty mentions for plain message', () => {
    const result = parseMention('just a normal message')
    expect(result.mentions).toHaveLength(0)
    expect(result.isAllMention).toBe(false)
    expect(result.cleanContent).toBe('just a normal message')
  })
})
```

- [ ] **Step 6: Run test — confirm it fails**

```bash
cd apps/web && pnpm test -- src/lib/__tests__/mention-parser.test.ts
```

Wait — `apps/web` doesn't have Vitest configured yet. Add `vitest.config.ts` to `apps/web`:

```typescript
// apps/web/vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@squad/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
```

Also add `test` script to `apps/web/package.json`:
```json
"test": "vitest run"
```

Now run: `cd apps/web && pnpm test -- src/lib/__tests__/mention-parser.test.ts`
Expected: FAIL — `Cannot find module '../mention-parser.js'`

- [ ] **Step 7: Run test — confirm it passes after implementation**

The implementation was already done in Step 4. Run again:

```bash
cd apps/web && pnpm test -- src/lib/__tests__/mention-parser.test.ts
```

Expected: PASS (6 tests)

---

## Task 4: Auth pages (login + OAuth callback)

**Files:**
- Create: `apps/web/src/app/auth/login/page.tsx`
- Create: `apps/web/src/app/auth/callback/route.ts`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/auth/login/page.tsx`**

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setSent(true)
    setLoading(false)
  }

  async function handleGitHubLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-sm space-y-6 p-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Squad</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">Collaborative vibecoding platform</p>

        {sent ? (
          <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 p-3 rounded-lg">
            Check your email for a magic link.
          </p>
        ) : (
          <>
            <form onSubmit={handleEmailLogin} className="space-y-3">
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-800 px-2 text-slate-500">or</span>
              </div>
            </div>

            <button
              onClick={handleGitHubLogin}
              className="w-full py-2 px-4 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/web/src/app/auth/callback/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(next, request.url))
}
```

- [ ] **Step 3: Update `apps/web/src/app/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/new')
  }

  redirect('/auth/login')
}
```

---

## Task 5: POST /api/session + /new page

**Files:**
- Create: `apps/web/src/app/api/session/route.ts`
- Create: `apps/web/src/app/new/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/api/session/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface CreateSessionBody {
  name: string
  githubRepoUrl?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateSessionBody
  try {
    body = await req.json() as CreateSessionBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'Session name is required' }, { status: 400 })
  }

  // Create session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      host_user_id: user.id,
      name: body.name.trim(),
      github_repo_url: body.githubRepoUrl ?? null,
    })
    .select()
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  // Get user profile for display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const displayName = profile?.display_name ?? user.email ?? 'Unknown'

  // Add host as first member (agent claude-u1)
  const { error: memberError } = await supabase
    .from('session_members')
    .insert({
      session_id: session.id,
      user_id: user.id,
      agent_id: 'claude-u1',
      display_name: `Claude (${displayName})`,
      is_host: true,
    })

  if (memberError) {
    return NextResponse.json({ error: 'Failed to add host to session' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return NextResponse.json({
    sessionId: session.id,
    inviteCode: session.invite_code,
    inviteUrl: `${appUrl}/join/${session.invite_code}`,
  })
}
```

- [ ] **Step 2: Create `apps/web/src/app/new/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewSessionPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
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
          <input
            type="text"
            placeholder="e.g. Invoicing SaaS MVP"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />

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

---

## Task 6: Session join flow

**Files:**
- Create: `apps/web/src/app/api/session/join/[inviteCode]/route.ts`
- Create: `apps/web/src/app/join/[code]/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/api/session/join/[inviteCode]/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: Promise<{ inviteCode: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { inviteCode } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Look up session by invite code
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, name, host_user_id, status, invite_code')
    .eq('invite_code', inviteCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json(
      { error: 'Session not found or invite code invalid' },
      { status: 404 }
    )
  }

  if (session.status === 'done' || session.status === 'archived') {
    return NextResponse.json({ error: 'Session is no longer active' }, { status: 410 })
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from('session_members')
    .select('agent_id')
    .eq('session_id', session.id)
    .eq('user_id', user.id)
    .single()

  if (existingMember) {
    return NextResponse.json({ error: 'You are already a member of this session' }, { status: 409 })
  }

  // Count current members to assign next agent ID
  const { data: members } = await supabase
    .from('session_members')
    .select('agent_id, user_id, display_name')
    .eq('session_id', session.id)

  const memberCount = members?.length ?? 0
  const nextAgentNumber = memberCount + 1
  const newAgentId = `claude-u${nextAgentNumber}`

  // Get host display name
  const { data: hostProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', session.host_user_id)
    .single()

  // Get joining user display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const displayName = profile?.display_name ?? user.email ?? 'Unknown'

  // Add user as member
  const { error: insertError } = await supabase
    .from('session_members')
    .insert({
      session_id: session.id,
      user_id: user.id,
      agent_id: newAgentId,
      display_name: `Claude (${displayName})`,
      is_host: false,
    })

  if (insertError) {
    return NextResponse.json({ error: 'Failed to join session' }, { status: 500 })
  }

  return NextResponse.json({
    sessionId: session.id,
    sessionName: session.name,
    hostDisplayName: hostProfile?.display_name ?? 'Unknown',
    memberCount: memberCount + 1,
    agentId: newAgentId,
  })
}
```

- [ ] **Step 2: Create `apps/web/src/app/join/[code]/page.tsx`**

```tsx
'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface PageProps {
  params: Promise<{ code: string }>
}

export default function JoinPage({ params }: PageProps) {
  const { code } = use(params)
  const router = useRouter()
  const [status, setStatus] = useState<'joining' | 'already_member' | 'error'>('joining')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function join() {
      const res = await fetch(`/api/session/join/${code}`)
      const data = await res.json() as { sessionId?: string; error?: string }

      if (res.status === 409) {
        // Already a member — redirect to session
        const sessionRes = await fetch(`/api/session/join/${code}`)
        // We need the session ID — get it another way
        // The 409 response doesn't include sessionId, so we redirect to / and let them find it
        setStatus('already_member')
        return
      }

      if (!res.ok || !data.sessionId) {
        setStatus('error')
        setErrorMsg(data.error ?? 'Could not join session')
        return
      }

      router.push(`/session/${data.sessionId}`)
    }

    void join()
  }, [code, router])

  if (status === 'joining') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600 dark:text-slate-400">Joining session…</p>
      </div>
    )
  }

  if (status === 'already_member') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-700 dark:text-slate-300">You&apos;re already in this session.</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-red-600 dark:text-red-400">{errorMsg}</p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-sm rounded-lg"
        >
          Go home
        </button>
      </div>
    </div>
  )
}
```

---

## Task 7: Base chat components (AgentStatusPill, SystemNotice, HumanMessage, AgentMessage, MessageItem)

**Files:**
- Create: `apps/web/src/components/sidebar/AgentStatusPill.tsx`
- Create: `apps/web/src/components/sidebar/TokenMeter.tsx`
- Create: `apps/web/src/components/chat/SystemNotice.tsx`
- Create: `apps/web/src/components/chat/HumanMessage.tsx`
- Create: `apps/web/src/components/chat/AgentMessage.tsx`
- Create: `apps/web/src/components/chat/MessageItem.tsx`

- [ ] **Step 1: Create `apps/web/src/components/sidebar/AgentStatusPill.tsx`**

```tsx
import type { AgentRecord } from '@squad/types'

interface AgentStatusPillProps {
  status: AgentRecord['status']
  size?: 'sm' | 'md'
}

const STATUS_STYLES: Record<AgentRecord['status'], string> = {
  idle: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  brainstorming: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  planning: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  building: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 animate-pulse',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  done: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  offline: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
}

export function AgentStatusPill({ status, size = 'sm' }: AgentStatusPillProps) {
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${textSize} ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}
```

- [ ] **Step 2: Create `apps/web/src/components/sidebar/TokenMeter.tsx`**

```tsx
interface TokenMeterProps {
  tokensIn: number
  tokensOut: number
  warningThreshold?: number
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function estimateCost(tokensIn: number, tokensOut: number): string {
  // claude-sonnet-4-6 pricing: $3/M in, $15/M out
  const cost = (tokensIn / 1_000_000) * 3 + (tokensOut / 1_000_000) * 15
  if (cost < 0.01) return '<$0.01'
  return `~$${cost.toFixed(2)}`
}

export function TokenMeter({ tokensIn, tokensOut, warningThreshold = 50_000 }: TokenMeterProps) {
  const total = tokensIn + tokensOut
  const pct = Math.min((total / warningThreshold) * 100, 100)
  const isWarning = total > warningThreshold * 0.8
  const isOver = total > warningThreshold

  const barColor = isOver
    ? 'bg-red-500'
    : isWarning
    ? 'bg-amber-500'
    : 'bg-purple-500'

  return (
    <div className="space-y-1" title={`${tokensIn.toLocaleString()} in · ${tokensOut.toLocaleString()} out · ${estimateCost(tokensIn, tokensOut)}`}>
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{formatTokens(total)} tok</span>
        <span>{estimateCost(tokensIn, tokensOut)}</span>
      </div>
      <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `apps/web/src/components/chat/SystemNotice.tsx`**

```tsx
import type { Message } from '@/types/database'

interface SystemNoticeProps {
  message: Message
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function SystemNotice({ message }: SystemNoticeProps) {
  return (
    <div className="flex items-center gap-3 py-1 px-4" role="status">
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {message.content}
        <span className="ml-2 opacity-60">{formatTime(message.created_at)}</span>
      </span>
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/web/src/components/chat/HumanMessage.tsx`**

```tsx
import type { Message } from '@/types/database'

interface HumanMessageProps {
  message: Message
  currentUserId: string
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getInitial(displayName: string): string {
  return (displayName[0] ?? '?').toUpperCase()
}

export function HumanMessage({ message, currentUserId }: HumanMessageProps) {
  const isOwn = message.user_id === currentUserId
  const displayName = 'User' // resolved by parent from session_members

  return (
    <div className={`flex items-start gap-2 px-4 py-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="w-7 h-7 rounded-full bg-purple-200 dark:bg-purple-800 flex items-center justify-center text-xs font-medium text-purple-700 dark:text-purple-300 shrink-0">
        {getInitial(displayName)}
      </div>
      <div className={`max-w-xs lg:max-w-md space-y-1 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`px-3 py-2 rounded-2xl text-sm ${
          isOwn
            ? 'bg-purple-600 text-white rounded-br-sm'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-sm'
        }`}>
          {message.content}
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `apps/web/src/components/chat/AgentMessage.tsx`**

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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function AgentMessage({ message }: AgentMessageProps) {
  const agentId = message.agent_id ?? 'claude-u1'
  const colors = getAgentColor(agentId)
  const modeBadgeClass = message.mode ? MODE_BADGE[message.mode] : ''

  return (
    <div className={`mx-4 my-1 rounded-lg border-l-4 p-3 ${colors.bg} ${colors.border}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold ${colors.text}`}>{agentId}</span>
        {message.mode && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${modeBadgeClass}`}>
            {message.mode}
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

- [ ] **Step 6: Create `apps/web/src/components/chat/MessageItem.tsx`**

```tsx
import type { Message } from '@/types/database'
import { HumanMessage } from './HumanMessage'
import { AgentMessage } from './AgentMessage'
import { SystemNotice } from './SystemNotice'

interface MessageItemProps {
  message: Message
  currentUserId: string
}

export function MessageItem({ message, currentUserId }: MessageItemProps) {
  if (message.sender_type === 'human') {
    return <HumanMessage message={message} currentUserId={currentUserId} />
  }
  if (message.sender_type === 'system') {
    return <SystemNotice message={message} />
  }
  return <AgentMessage message={message} />
}
```

---

## Task 8: MessageInput with @mention highlight + autocomplete

**Files:**
- Create: `apps/web/src/components/chat/MessageInput.tsx`

- [ ] **Step 1: Create `apps/web/src/components/chat/MessageInput.tsx`**

```tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import { parseMention } from '@/lib/mention-parser'

interface MessageInputProps {
  sessionId: string
  currentUserId: string
  availableAgentIds: string[]
  onSend: (content: string) => Promise<void>
  disabled?: boolean
}

export function MessageInput({
  sessionId: _sessionId,
  currentUserId: _currentUserId,
  availableAgentIds,
  onSend,
  disabled = false,
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteFilter, setAutocompleteFilter] = useState('')
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filteredAgents = ['all', ...availableAgentIds].filter((id) =>
    id.toLowerCase().startsWith(autocompleteFilter.toLowerCase())
  )

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    setValue(text)

    // Detect @mention autocomplete trigger
    const cursor = e.target.selectionStart ?? text.length
    const textBeforeCursor = text.slice(0, cursor)
    const atMatch = /@(\S*)$/.exec(textBeforeCursor)

    if (atMatch) {
      setAutocompleteFilter(atMatch[1] ?? '')
      setShowAutocomplete(true)
      setAutocompleteIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }

  function insertMention(agentId: string) {
    if (!textareaRef.current) return
    const cursor = textareaRef.current.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursor)
    const textAfterCursor = value.slice(cursor)
    const atIndex = textBeforeCursor.lastIndexOf('@')
    const newText = textBeforeCursor.slice(0, atIndex) + `@${agentId} ` + textAfterCursor
    setValue(newText)
    setShowAutocomplete(false)
    textareaRef.current.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAutocompleteIndex((i) => Math.min(i + 1, filteredAgents.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAutocompleteIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const selected = filteredAgents[autocompleteIndex]
        if (selected) {
          e.preventDefault()
          insertMention(selected)
          return
        }
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleSend = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || sending || disabled) return
    setSending(true)
    try {
      await onSend(trimmed)
      setValue('')
      setShowAutocomplete(false)
    } finally {
      setSending(false)
    }
  }, [value, sending, disabled, onSend])

  // Render value with @mention highlights
  const parsed = parseMention(value)
  const hasMentions = parsed.mentions.length > 0

  return (
    <div className="relative border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
      {/* Autocomplete dropdown */}
      {showAutocomplete && filteredAgents.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-10">
          {filteredAgents.map((id, i) => (
            <button
              key={id}
              className={`w-full text-left px-3 py-2 text-sm ${
                i === autocompleteIndex
                  ? 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              onMouseDown={(e) => { e.preventDefault(); insertMention(id) }}
              onMouseEnter={() => setAutocompleteIndex(i)}
            >
              @{id}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || sending}
            placeholder={disabled ? 'Waiting for agent response…' : 'Message the squad… (@claude-1 to mention)'}
            rows={1}
            className="w-full resize-none px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            aria-label="Message input"
          />
          {hasMentions && (
            <div className="flex flex-wrap gap-1 mt-1" aria-label="Mentions">
              {parsed.mentions.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                >
                  @{m}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => void handleSend()}
          disabled={!value.trim() || sending || disabled}
          className="shrink-0 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          aria-label="Send message"
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-1">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}
```

---

## Task 9: Realtime hook + MessageList

**Files:**
- Create: `apps/web/src/hooks/useRealtimeMessages.ts`
- Create: `apps/web/src/components/chat/MessageList.tsx`

- [ ] **Step 1: Create `apps/web/src/hooks/useRealtimeMessages.ts`**

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/types/database'

export function useRealtimeMessages(sessionId: string, initialMessages: Message[]) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`messages:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          addMessage(payload.new as Message)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId, addMessage])

  return messages
}
```

- [ ] **Step 2: Create `apps/web/src/components/chat/MessageList.tsx`**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages'
import { MessageItem } from './MessageItem'
import type { Message } from '@/types/database'

interface MessageListProps {
  sessionId: string
  currentUserId: string
  initialMessages: Message[]
}

export function MessageList({ sessionId, currentUserId, initialMessages }: MessageListProps) {
  const messages = useRealtimeMessages(sessionId, initialMessages)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on mount
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [])

  // Auto-scroll on new messages if near bottom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distFromBottom < 100) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          No messages yet. Start the session by describing what you want to build.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto py-4 space-y-1"
      role="log"
      aria-label="Session messages"
      aria-live="polite"
    >
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} currentUserId={currentUserId} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

---

## Task 10: PresenceSidebar + Partykit hook + Session page

**Files:**
- Create: `apps/web/src/hooks/usePartykitSession.ts`
- Create: `apps/web/src/components/sidebar/PresenceSidebar.tsx`
- Create: `apps/web/src/components/session/SessionLayout.tsx`
- Create: `apps/web/src/app/session/[id]/page.tsx`

- [ ] **Step 1: Create `apps/web/src/hooks/usePartykitSession.ts`**

```typescript
'use client'

import { useEffect, useState, useRef } from 'react'
import PartySocket from 'partysocket'
import type { AgentRegistry, ServerMessage, ClientMessage } from '@squad/types'

interface PartykitState {
  agents: AgentRegistry
  connected: boolean
}

export function usePartykitSession(sessionId: string, agentId: string): PartykitState {
  const [agents, setAgents] = useState<AgentRegistry>({})
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<PartySocket | null>(null)

  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'localhost:1999'
    const socket = new PartySocket({
      host,
      room: sessionId,
    })
    socketRef.current = socket

    socket.addEventListener('open', () => {
      setConnected(true)
      // Register this agent
      const regMsg: ClientMessage = {
        type: 'register_agent',
        agentId,
        userId: sessionId, // ASSUMPTION: using sessionId as proxy for userId until auth wired
        displayName: `Claude (user)`,
      }
      socket.send(JSON.stringify(regMsg))
    })

    socket.addEventListener('close', () => setConnected(false))

    socket.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage
        if (msg.type === 'agent_update') {
          setAgents((prev) => ({ ...prev, [msg.payload.agentId]: msg.payload }))
        }
        if (msg.type === 'session_state') {
          // Initial connection — no agents in session_state, those come via agent_update
        }
      } catch {
        // ignore malformed
      }
    })

    // Heartbeat every 30s
    const heartbeatInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        const hb: ClientMessage = { type: 'heartbeat', agentId }
        socket.send(JSON.stringify(hb))
      }
    }, 30_000)

    return () => {
      clearInterval(heartbeatInterval)
      socket.close()
    }
  }, [sessionId, agentId])

  return { agents, connected }
}
```

- [ ] **Step 2: Create `apps/web/src/components/sidebar/PresenceSidebar.tsx`**

```tsx
'use client'

import type { SessionMember } from '@/types/database'
import type { AgentRecord } from '@squad/types'
import { AgentStatusPill } from './AgentStatusPill'
import { TokenMeter } from './TokenMeter'

interface PresenceSidebarProps {
  members: SessionMember[]
  agentStatuses: Record<string, AgentRecord>
  tokenMeters: Record<string, { tokensIn: number; tokensOut: number }>
  currentUserId: string
  connected: boolean
}

export function PresenceSidebar({
  members,
  agentStatuses,
  tokenMeters,
  currentUserId,
  connected,
}: PresenceSidebarProps) {
  return (
    <aside className="w-60 border-r border-slate-200 dark:border-slate-700 flex flex-col p-3 gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Members ({members.length})
        </h2>
        <span
          className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-400'}`}
          aria-label={connected ? 'Online' : 'Offline'}
          title={connected ? 'Connected' : 'Reconnecting…'}
        />
      </div>

      <div className="space-y-4">
        {members.map((member) => {
          const agent = agentStatuses[member.agent_id]
          const meter = tokenMeters[member.user_id]
          const isCurrentUser = member.user_id === currentUserId
          const isOnline = agent
            ? Date.now() - agent.lastHeartbeat < 90_000
            : false

          return (
            <div key={member.user_id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-green-500' : 'bg-slate-400'}`}
                  aria-label={isOnline ? 'Online' : 'Offline'}
                />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {member.display_name.replace(/^Claude \(/, '').replace(/\)$/, '')}
                  {member.is_host && (
                    <span className="ml-1 text-xs text-slate-500">(host)</span>
                  )}
                  {isCurrentUser && (
                    <span className="ml-1 text-xs text-purple-500">(you)</span>
                  )}
                </span>
              </div>

              <div className="ml-4 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {member.agent_id}
                  </span>
                  {agent && <AgentStatusPill status={agent.status} />}
                </div>
                {meter && (
                  <TokenMeter tokensIn={meter.tokensIn} tokensOut={meter.tokensOut} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Create `apps/web/src/components/session/SessionLayout.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { SessionMember, Message, Session } from '@/types/database'
import type { AgentRecord } from '@squad/types'
import { MessageList } from '../chat/MessageList'
import { MessageInput } from '../chat/MessageInput'
import { PresenceSidebar } from '../sidebar/PresenceSidebar'
import { usePartykitSession } from '@/hooks/usePartykitSession'
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

  const availableAgentIds = members
    .map((m) => m.agent_id)
    .filter((id) => id !== currentMember.agent_id)

  async function handleSend(content: string) {
    const supabase = createClient()
    await supabase.from('messages').insert({
      session_id: session.id,
      sender_type: 'human',
      user_id: currentUserId,
      content,
      metadata: {},
    })
    // Phase 3: check for @mentions and call /api/mention
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
        <h1 className="font-semibold text-slate-900 dark:text-white truncate">{session.name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          session.status === 'building'
            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
        }`}>
          {session.status}
        </span>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Presence */}
        <PresenceSidebar
          members={members}
          agentStatuses={agents}
          tokenMeters={{}}
          currentUserId={currentUserId}
          connected={connected}
        />

        {/* Center: Chat */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <MessageList
            sessionId={session.id}
            currentUserId={currentUserId}
            initialMessages={initialMessages}
          />
          <MessageInput
            sessionId={session.id}
            currentUserId={currentUserId}
            availableAgentIds={availableAgentIds}
            onSend={handleSend}
          />
        </main>

        {/* Right: Task board placeholder (Phase 3+) */}
        <aside className="w-72 border-l border-slate-200 dark:border-slate-700 p-3 hidden lg:block">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Tasks
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Tasks appear here after the build starts.
          </p>
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/web/src/app/session/[id]/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { SessionLayout } from '@/components/session/SessionLayout'
import type { Message, Session, SessionMember } from '@/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SessionPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Load session
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (!session) notFound()

  // Load members
  const { data: members } = await supabase
    .from('session_members')
    .select('*')
    .eq('session_id', id)
    .order('joined_at', { ascending: true })

  // Check current user is a member
  const currentMember = (members ?? []).find((m) => m.user_id === user.id)
  if (!currentMember) {
    // Not a member — redirect to join page (shouldn't normally happen)
    redirect('/')
  }

  // Load last 200 messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  return (
    <SessionLayout
      session={session as Session}
      members={(members ?? []) as SessionMember[]}
      initialMessages={(messages ?? []) as Message[]}
      currentUserId={user.id}
      currentMember={currentMember as SessionMember}
    />
  )
}
```

- [ ] **Step 5: Run typecheck**

```bash
cd C:/Users/keven/Documents/swarm && pnpm typecheck
```

Expected: 0 errors. Fix any that appear.

- [ ] **Step 6: Start dev server and verify**

```bash
pnpm dev
```

Open `http://localhost:3000` — should redirect to `/auth/login`.

Log in with a real Supabase project. Create a session at `/new`. Open the session URL in two tabs. Send a message in Tab A — verify it appears in Tab B within 500ms via Realtime.

---

## Phase 2 Acceptance Criteria Checklist

- [ ] Two browser tabs can join the same session (Tab A creates → share invite link → Tab B joins via `/join/[code]`)
- [ ] Message sent in Tab A appears in Tab B within 500ms (Supabase Realtime)
- [ ] Presence sidebar shows both users as online (PresenceSidebar + Partykit)
- [ ] @mention text (`@claude-1`) is highlighted as a purple pill in the input before sending
- [ ] Messages persist across page reload (loaded server-side on mount)
- [ ] Auth works: unauthenticated users are redirected to `/auth/login`
- [ ] All mention-parser unit tests pass (`pnpm test`)
