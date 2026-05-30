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
