
-- Wipe old schema
drop table if exists public.audit_log cascade;
drop table if exists public.room_players cascade;
drop table if exists public.rooms cascade;
drop table if exists public.players cascade;
drop type if exists room_status cascade;
drop type if exists win_pattern cascade;

-- Enums
create type room_status as enum ('lobby','live','finished');
create type room_player_role as enum ('player','watcher');
create type tx_kind as enum ('stake','payout','refund','seed');

-- Players (with wallet)
create table public.players (
  id uuid primary key default gen_random_uuid(),
  telegram_id text unique not null,
  username text not null,
  wallet_balance int not null default 1000,
  created_at timestamptz not null default now()
);
alter table public.players enable row level security;
create policy "players readable" on public.players for select using (true);

-- Rooms
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid not null references public.players(id) on delete cascade,
  status room_status not null default 'lobby',
  stake_amount int not null default 20,
  house_commission_pct int not null default 20,
  derash int not null default 0,
  call_interval_ms int not null default 4000,
  lobby_seconds int not null default 30,
  lobby_ends_at timestamptz,
  current_index int not null default -1,
  call_sequence int[] not null default '{}',
  winner_id uuid references public.players(id),
  winning_line text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
alter table public.rooms enable row level security;
create policy "rooms readable" on public.rooms for select using (true);

-- Memberships
create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  role room_player_role not null default 'player',
  stake_paid boolean not null default false,
  card int[] not null default '{}', -- 25 entries; index 12 is 0 (FREE)
  marked int[] not null default '{0}', -- FREE pre-marked
  joined_at timestamptz not null default now(),
  unique(room_id, player_id)
);
alter table public.room_players enable row level security;
create policy "room_players readable" on public.room_players for select using (true);

-- Transactions
create table public.transactions (
  id bigserial primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  kind tx_kind not null,
  amount int not null,
  balance_after int not null,
  created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
create policy "tx readable" on public.transactions for select using (true);

-- Audit log
create table public.audit_log (
  id bigserial primary key,
  room_id uuid references public.rooms(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  action text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create policy "audit readable" on public.audit_log for select using (true);

-- Realtime
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.players;
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
alter table public.players replica identity full;
