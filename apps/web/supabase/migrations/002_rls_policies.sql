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
