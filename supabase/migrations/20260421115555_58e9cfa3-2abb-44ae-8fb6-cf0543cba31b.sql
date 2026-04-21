
-- Players: persisted identity (Telegram or mock)
create table public.players (
  id uuid primary key default gen_random_uuid(),
  telegram_id text unique not null,
  username text not null,
  created_at timestamptz not null default now()
);
alter table public.players enable row level security;
create policy "players readable by all" on public.players for select using (true);
create policy "players insertable by all" on public.players for insert with check (true);
create policy "players self update" on public.players for update using (true);

-- Rooms
create type room_status as enum ('lobby','countdown','live','paused','finished');
create type win_pattern as enum ('full_house');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid not null references public.players(id) on delete cascade,
  status room_status not null default 'lobby',
  pattern win_pattern not null default 'full_house',
  call_interval_ms int not null default 3500,
  current_index int not null default -1,
  call_sequence int[] not null default '{}',
  winner_id uuid references public.players(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
alter table public.rooms enable row level security;
create policy "rooms readable by all" on public.rooms for select using (true);
create policy "rooms insertable by all" on public.rooms for insert with check (true);
create policy "rooms updatable by all" on public.rooms for update using (true);

-- Memberships / cards
create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  ready boolean not null default false,
  card int[] not null default '{}',
  marked int[] not null default '{}',
  joined_at timestamptz not null default now(),
  unique(room_id, player_id)
);
alter table public.room_players enable row level security;
create policy "room_players readable by all" on public.room_players for select using (true);
create policy "room_players insertable by all" on public.room_players for insert with check (true);
create policy "room_players updatable by all" on public.room_players for update using (true);
create policy "room_players deletable by all" on public.room_players for delete using (true);

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
create policy "audit insertable" on public.audit_log for insert with check (true);

-- Realtime
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
