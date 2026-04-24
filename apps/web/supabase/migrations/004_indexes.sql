create index sessions_invite_code on public.sessions(invite_code);
create index session_members_user_id on public.session_members(user_id);
create index messages_session_created_asc on public.messages(session_id, created_at asc);
create index token_usage_session_id on public.token_usage(session_id);
