create table if not exists public.pos_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_pos_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pos_state_updated_at on public.pos_state;

create trigger pos_state_updated_at
before update on public.pos_state
for each row
execute function public.set_pos_state_updated_at();

alter table public.pos_state enable row level security;

drop policy if exists "Allow POS app read" on public.pos_state;
drop policy if exists "Allow POS app insert" on public.pos_state;
drop policy if exists "Allow POS app update" on public.pos_state;

create policy "Allow POS app read"
on public.pos_state
for select
using (true);

create policy "Allow POS app insert"
on public.pos_state
for insert
with check (true);

create policy "Allow POS app update"
on public.pos_state
for update
using (true)
with check (true);

-- Users management table
create table if not exists public.pos_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_pos_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pos_users_updated_at on public.pos_users;

create trigger pos_users_updated_at
before update on public.pos_users
for each row
execute function public.set_pos_users_updated_at();

-- Enable RLS and create policies for users
alter table public.pos_users enable row level security;

drop policy if exists "Allow POS users read" on public.pos_users;
drop policy if exists "Allow POS users insert" on public.pos_users;
drop policy if exists "Allow POS users update" on public.pos_users;

-- Allow anyone to read users (for login/signup verification)
create policy "Allow POS users read"
on public.pos_users
for select
using (true);

-- Allow anyone to create new users (signup)
create policy "Allow POS users insert"
on public.pos_users
for insert
with check (true);

-- Allow updating users (role assignment, status changes by manager)
create policy "Allow POS users update"
on public.pos_users
for update
using (true)
with check (true);

-- Create indexes for faster queries
create index if not exists idx_pos_users_email on public.pos_users(email);
create index if not exists idx_pos_users_status on public.pos_users(status);
create index if not exists idx_pos_users_role on public.pos_users(role);
