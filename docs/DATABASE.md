# Database migrations

All migrations live in `apps/web/supabase/migrations/`. Run them with `supabase db push` or the Supabase CLI. They must be applied in order — the filename prefix determines order.

Never modify an existing migration file. Add new migrations for schema changes.

---

## 001_initial_schema.sql

```sql
-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- SESSIONS
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- SESSION MEMBERS
-- ─────────────────────────────────────────────
create table public.session_members (
  session_id    uuid references public.sessions(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  agent_id      text not null,         -- "claude-u1", "claude-u2", etc.
  display_name  text not null,         -- "Claude (Keven)"
  is_host       boolean not null default false,
  joined_at     timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- Enforce that each agent_id is unique within a session
create unique index session_members_agent_id_unique
  on public.session_members(session_id, agent_id);

-- ─────────────────────────────────────────────
-- MESSAGES
-- ─────────────────────────────────────────────
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references public.sessions(id) on delete cascade not null,
  sender_type   text not null check (sender_type in ('human', 'agent', 'system')),
  user_id       uuid references auth.users(id) on delete set null,
  agent_id      text,                  -- null for human/system messages
  content       text not null,
  mode          text check (mode in ('brainstorm', 'review', 'plan', 'build', 'status', null)),
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- Index for efficient chat loading
create index messages_session_created
  on public.messages(session_id, created_at desc);

-- ─────────────────────────────────────────────
-- TOKEN USAGE
-- ─────────────────────────────────────────────
create table public.token_usage (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references public.sessions(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  task_id       text,                  -- null for chat-mode token usage
  model         text not null,         -- e.g. "claude-sonnet-4-6"
  tokens_in     integer not null check (tokens_in >= 0),
  tokens_out    integer not null check (tokens_out >= 0),
  cost_usd      numeric(10, 6),        -- computed at insert time from model pricing
  recorded_at   timestamptz not null default now()
);

create index token_usage_session_user
  on public.token_usage(session_id, user_id);

-- ─────────────────────────────────────────────
-- USER PROFILES (extends auth.users)
-- ─────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  github_username text,
  github_access_token text,           -- encrypted at app level before storage
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create profile on user signup
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

-- Auto-update updated_at
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

---

## 002_rls_policies.sql

```sql
-- ─────────────────────────────────────────────
-- ENABLE RLS ON ALL TABLES
-- ─────────────────────────────────────────────
alter table public.sessions        enable row level security;
alter table public.session_members enable row level security;
alter table public.messages        enable row level security;
alter table public.token_usage     enable row level security;
alter table public.profiles        enable row level security;

-- ─────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────
-- Users can read any profile (needed for showing member names)
create policy "profiles_select_any"
  on public.profiles for select
  using (true);

-- Users can only update their own profile
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- ─────────────────────────────────────────────
-- SESSIONS
-- ─────────────────────────────────────────────
-- A user can see a session if they are a member
create policy "sessions_select_member"
  on public.sessions for select
  using (
    exists (
      select 1 from public.session_members sm
      where sm.session_id = id
        and sm.user_id = auth.uid()
    )
  );

-- Any authenticated user can create a session
create policy "sessions_insert_authenticated"
  on public.sessions for insert
  with check (auth.uid() = host_user_id);

-- Only the host can update session metadata
create policy "sessions_update_host"
  on public.sessions for update
  using (auth.uid() = host_user_id);

-- ─────────────────────────────────────────────
-- SESSION MEMBERS
-- ─────────────────────────────────────────────
-- Members can see other members in their sessions
create policy "session_members_select_member"
  on public.session_members for select
  using (
    exists (
      select 1 from public.session_members sm
      where sm.session_id = session_members.session_id
        and sm.user_id = auth.uid()
    )
  );

-- Any authenticated user can join a session (invite code validated at app level)
create policy "session_members_insert_self"
  on public.session_members for insert
  with check (auth.uid() = user_id);

-- Members can remove themselves; hosts can remove anyone
create policy "session_members_delete"
  on public.session_members for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.sessions s
      where s.id = session_id
        and s.host_user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- MESSAGES
-- ─────────────────────────────────────────────
-- Members of a session can read its messages
create policy "messages_select_member"
  on public.messages for select
  using (
    exists (
      select 1 from public.session_members sm
      where sm.session_id = messages.session_id
        and sm.user_id = auth.uid()
    )
  );

-- Members can insert messages into their sessions
-- Agent/system messages are inserted server-side with service role key,
-- so this policy covers human messages only (user_id = auth.uid())
create policy "messages_insert_member"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.session_members sm
      where sm.session_id = messages.session_id
        and sm.user_id = auth.uid()
    )
    and sender_type = 'human'
    and user_id = auth.uid()
  );

-- No updates or deletes on messages (append-only)

-- ─────────────────────────────────────────────
-- TOKEN USAGE
-- ─────────────────────────────────────────────
-- Users can see their own token usage; hosts see all in their sessions
create policy "token_usage_select"
  on public.token_usage for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.sessions s
      where s.id = token_usage.session_id
        and s.host_user_id = auth.uid()
    )
  );

-- Token usage is only written server-side (service role) — no insert policy for users
```

---

## 003_realtime.sql

```sql
-- Enable Realtime on messages table (INSERT events only — updates/deletes not needed)
-- Run this in the Supabase dashboard SQL editor or via CLI
-- (Realtime configuration is not a standard migration — do it via dashboard)

-- However, add a publication for completeness:
-- In supabase/config.toml, set:
--   [realtime]
--   enabled = true
-- And in the Realtime dashboard, enable the messages table for INSERT events.

-- What we DO set up here: a helper view for session summary
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

-- Grant access to the view
grant select on public.session_token_summary to authenticated;
```

---

## 004_indexes.sql

```sql
-- Additional indexes for common query patterns

-- Loading a session by invite code (join flow)
create index sessions_invite_code on public.sessions(invite_code);

-- Loading all sessions a user is part of (dashboard)
create index session_members_user_id on public.session_members(user_id);

-- Loading messages for a session in pages
create index messages_session_created_asc
  on public.messages(session_id, created_at asc);

-- Token usage by session (for summary view)
create index token_usage_session_id on public.token_usage(session_id);
```

---

## Notes on service role usage

Agent messages, system messages, and token usage records are all written using the **Supabase service role key** (never the anon key). This bypasses RLS intentionally — agents are server-side processes, not browser users.

The service role key is only used in:
- `apps/web/src/lib/supabase/server.ts` (for API routes that insert agent messages)
- `apps/party/src/server.ts` (for flushing session data on close)
- `packages/agent-runner/src/sss-client.ts` (for writing token usage at task completion)

Never expose the service role key to the browser. Never put it in a `NEXT_PUBLIC_` variable.
