-- Life Control cloud storage for project riqmwueobjazfnhvvumy
-- Safe to run in Supabase SQL Editor. RLS is enabled.

create table if not exists public.life_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  schema_version integer not null default 41,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_life_state_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists life_state_updated_at on public.life_state;
create trigger life_state_updated_at
before update on public.life_state
for each row execute function public.set_life_state_updated_at();

alter table public.life_state enable row level security;

drop policy if exists "life_state_select_own" on public.life_state;
create policy "life_state_select_own" on public.life_state
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "life_state_insert_own" on public.life_state;
create policy "life_state_insert_own" on public.life_state
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "life_state_update_own" on public.life_state;
create policy "life_state_update_own" on public.life_state
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "life_state_delete_own" on public.life_state;
create policy "life_state_delete_own" on public.life_state
for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.life_state to authenticated;
