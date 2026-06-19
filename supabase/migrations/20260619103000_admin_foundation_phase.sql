alter table public.players
  add column if not exists is_blocked boolean not null default false;

create index if not exists players_is_blocked_idx on public.players (is_blocked);