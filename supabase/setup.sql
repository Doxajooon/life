-- Life: cloud storage for project riqmwueobjazfnhvvumy. Safe to re-run in the SQL Editor.

create table if not exists public.life_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  schema_version integer not null default 58,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at is the row version: the app writes with "where updated_at = <version I saw>".
create or replace function public.set_life_state_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists life_state_updated_at on public.life_state;
create trigger life_state_updated_at before update on public.life_state
for each row execute function public.set_life_state_updated_at();

alter table public.life_state enable row level security;
drop policy if exists "life_state_select_own" on public.life_state;
create policy "life_state_select_own" on public.life_state for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "life_state_insert_own" on public.life_state;
create policy "life_state_insert_own" on public.life_state for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "life_state_update_own" on public.life_state;
create policy "life_state_update_own" on public.life_state for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "life_state_delete_own" on public.life_state;
create policy "life_state_delete_own" on public.life_state for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.life_state to authenticated;
alter table public.life_state alter column schema_version set default 58;

-- AI rate limit (survives Edge Function restarts)
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists ai_usage_user_at on public.ai_usage (user_id, at desc);
alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "ai_usage_insert_own" on public.ai_usage;
create policy "ai_usage_insert_own" on public.ai_usage for insert to authenticated with check (user_id = (select auth.uid()));
grant select, insert on public.ai_usage to authenticated;
-- V72: cloud copies — one snapshot of the state a day per user, the app keeps 30 days (only new objects; nothing existing is changed)
create table if not exists public.life_state_history (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create index if not exists life_state_history_user_day on public.life_state_history (user_id, day desc);
alter table public.life_state_history enable row level security;
drop policy if exists "life_state_history_select_own" on public.life_state_history;
create policy "life_state_history_select_own" on public.life_state_history for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "life_state_history_insert_own" on public.life_state_history;
create policy "life_state_history_insert_own" on public.life_state_history for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "life_state_history_delete_own" on public.life_state_history;
create policy "life_state_history_delete_own" on public.life_state_history for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.life_state_history to authenticated;

-- 74.6: the signed-in user can delete their own account (button «Удалить аккаунт и данные»).
-- ON DELETE CASCADE removes life_state, life_state_history and ai_usage together with the user.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 74.6: every ai_usage row says what it is: 'ok' = an answer, 'try' = a failed attempt; rows older than 30 days are removed by the function
alter table public.ai_usage add column if not exists kind text not null default 'ok' check (kind in ('ok', 'try'));
drop policy if exists "ai_usage_delete_old_own" on public.ai_usage;
create policy "ai_usage_delete_old_own" on public.ai_usage for delete to authenticated using (user_id = (select auth.uid()) and at < now() - interval '30 days');
grant delete on public.ai_usage to authenticated;

-- 74.8: (1) one number for the whole service — AI answers in the last 24 h (the Gemini key is one for all users); the function stops at AI_GLOBAL_PER_DAY (default 400)
create or replace function public.ai_global_used()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.ai_usage where kind = 'ok' and at >= now() - interval '24 hours';
$$;
revoke execute on function public.ai_global_used() from public, anon;
grant execute on function public.ai_global_used() to authenticated;
create index if not exists ai_usage_ok_at on public.ai_usage (at) where kind = 'ok';

-- 74.8: (2) nobody can store more than ~8 MB of state (12 goal photos of <= 350 000 characters fit with a large margin)
alter table public.life_state drop constraint if exists life_state_size_ck;
alter table public.life_state add constraint life_state_size_ck check (octet_length(state::text) <= 8000000);
alter table public.life_state_history drop constraint if exists life_state_history_size_ck;
alter table public.life_state_history add constraint life_state_history_size_ck check (octet_length(state::text) <= 8000000);

-- 74.8: (3) the app keeps 30 days of cloud copies; the database also drops a person's own copies older than 45 days at every new snapshot
create or replace function public.life_state_history_prune()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.life_state_history where user_id = new.user_id and day < new.day - 45;
  return null;
end;
$$;
drop trigger if exists life_state_history_prune_t on public.life_state_history;
create trigger life_state_history_prune_t after insert on public.life_state_history
  for each row execute function public.life_state_history_prune();
