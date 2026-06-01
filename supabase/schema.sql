-- Silhouette Studio Ops Dashboard — Supabase schema
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Profiles linked to Supabase Auth users (create users in Authentication first)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null default 'user' check (role in ('admin', 'user', 'instructor')),
  instructor_name text,
  display_name text,
  created_at timestamptz default now()
);

-- Shared app data (one row per localStorage key)
create table if not exists public.app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now() not null,
  updated_by text
);

create index if not exists app_state_updated_at_idx on public.app_state(updated_at desc);

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;

-- Authenticated team members can read/write all studio data
drop policy if exists "profiles read auth" on public.profiles;
create policy "profiles read auth" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "app_state read auth" on public.app_state;
create policy "app_state read auth" on public.app_state for select to authenticated using (true);

drop policy if exists "app_state write auth" on public.app_state;
create policy "app_state write auth" on public.app_state for insert to authenticated with check (true);

drop policy if exists "app_state update auth" on public.app_state;
create policy "app_state update auth" on public.app_state for update to authenticated using (true);

-- Enable Realtime for live updates across browsers
alter publication supabase_realtime add table public.app_state;

-- Optional: seed profiles after creating Auth users (replace UUIDs)
-- insert into public.profiles (id, username, role, instructor_name, display_name) values
--   ('00000000-0000-0000-0000-000000000001', 'maria', 'admin', null, 'Maria'),
--   ('00000000-0000-0000-0000-000000000002', 'oliver', 'admin', null, 'Oliver');
