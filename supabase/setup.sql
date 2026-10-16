-- Jamal Life: cloud storage for project riqmwueobjazfnhvvumy. Safe to re-run in the SQL Editor.

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
