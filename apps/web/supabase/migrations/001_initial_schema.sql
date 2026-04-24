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
