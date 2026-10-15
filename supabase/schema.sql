create table if not exists public.app_state (
  id integer primary key check (id = 1),
  state jsonb not null
);

alter table public.app_state enable row level security;

insert into public.app_state (id, state)
values (1, '{"users":[],"materials":[],"rooms":[]}'::jsonb)
on conflict (id) do nothing;
